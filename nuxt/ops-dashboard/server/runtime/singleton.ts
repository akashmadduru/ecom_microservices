import Docker from 'dockerode'
import { CoreV1Api, KubeConfig, Log, VersionApi } from '@kubernetes/client-node'
import { getOpsConfig } from './config'
import { DockerProvider } from './docker-provider'
import { DockerMutatingProvider } from './docker-mutating-provider'
import { KubernetesProvider } from './kubernetes-provider'
import type { RuntimeProvider } from './types'
import type { MutatingRuntimeProvider } from './mutating-types'

/**
 * TWO independent Docker() clients + providers for the whole server process:
 * one for reads (`getDockerClient`/`getRuntimeProvider`, talks to the
 * read-only proxy) and one for mutations (`getMutatingDockerClient`/
 * `getMutatingProvider`, talks to the separate mutate-only proxy). Never share
 * a client across the two — that would undo the two-proxy isolation.
 *
 * Both clients ALWAYS talk TCP to their respective socket proxy (host + port)
 * — never a unix socket path. Touching /var/run/docker.sock directly is
 * root-equivalent and is exactly what the proxies exist to prevent, so there
 * is no unix-socket branch here on purpose.
 */

let dockerClient: Docker | null = null
let mutatingDockerClient: Docker | null = null
let provider: RuntimeProvider | null = null
let k8sProvider: RuntimeProvider | null = null
let mutatingProvider: MutatingRuntimeProvider | null = null

export function getDockerClient(): Docker {
  if (!dockerClient) {
    const { dockerHost, dockerPort } = getOpsConfig()
    dockerClient = new Docker({ host: dockerHost, port: dockerPort })
  }
  return dockerClient
}

/**
 * Lazily construct the read-only Kubernetes provider from the AMBIENT kubeconfig
 * (`KubeConfig.loadFromDefault()` — `~/.kube/config` / `KUBECONFIG` / in-cluster
 * service account, whatever's present). Deliberately generic: no AWS/EKS SDK,
 * no IAM — an operator who has run `aws eks update-kubeconfig` gets EKS for free,
 * exactly like any other conformant cluster.
 */
function getKubernetesProvider(): RuntimeProvider {
  if (!k8sProvider) {
    const kc = new KubeConfig()
    kc.loadFromDefault()
    const { k8sNamespace } = getOpsConfig()
    k8sProvider = new KubernetesProvider(
      kc.makeApiClient(CoreV1Api),
      new Log(kc),
      kc.makeApiClient(VersionApi),
      k8sNamespace,
    )
  }
  return k8sProvider
}

/**
 * The read-only provider for the process, selected by `RUNTIME_MODE`. Defaults
 * to Docker, so existing deployments are unaffected; `kubernetes` swaps in the
 * generic Kubernetes provider behind the SAME interface — routes/frontend are
 * unchanged.
 */
export function getRuntimeProvider(): RuntimeProvider {
  const { runtimeMode } = getOpsConfig()
  if (runtimeMode === 'kubernetes') {
    return getKubernetesProvider()
  }
  if (!provider) {
    provider = new DockerProvider(getDockerClient())
  }
  return provider
}

/**
 * A SEPARATE dockerode client, pointed at the dedicated mutate-only
 * docker-socket-proxy (see config.ts's `mutateDockerHost` doc comment for why
 * this can't safely be the same client/proxy as the read-only side). Never
 * share this client with `getDockerClient()`.
 */
function getMutatingDockerClient(): Docker {
  if (!mutatingDockerClient) {
    const { mutateDockerHost, mutateDockerPort } = getOpsConfig()
    mutatingDockerClient = new Docker({ host: mutateDockerHost, port: mutateDockerPort })
  }
  return mutatingDockerClient
}

/**
 * Phase 2 mutating provider, lazily constructed on its OWN client/proxy —
 * kept separate from `getRuntimeProvider` so the read-only and mutating
 * surfaces remain distinct types AND distinct network paths; callers that only
 * need reads never touch this, and this never touches the read-only proxy.
 */
export function getMutatingProvider(): MutatingRuntimeProvider {
  // Defense in depth: the mutating surface is Docker-only. In kubernetes mode
  // the mutation routes are already rejected upstream (runContainerMutation),
  // but never hand back a Docker-shaped mutating provider here either.
  const { runtimeMode } = getOpsConfig()
  if (runtimeMode === 'kubernetes') {
    throw new Error('Mutating provider is not available in kubernetes mode.')
  }
  if (!mutatingProvider) {
    mutatingProvider = new DockerMutatingProvider(getMutatingDockerClient())
  }
  return mutatingProvider
}
