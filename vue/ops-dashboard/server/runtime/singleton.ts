import Docker from 'dockerode'
import { getOpsConfig } from './config'
import { DockerProvider } from './docker-provider'
import { DockerMutatingProvider } from './docker-mutating-provider'
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
let mutatingProvider: MutatingRuntimeProvider | null = null

export function getDockerClient(): Docker {
  if (!dockerClient) {
    const { dockerHost, dockerPort } = getOpsConfig()
    dockerClient = new Docker({ host: dockerHost, port: dockerPort })
  }
  return dockerClient
}

export function getRuntimeProvider(): RuntimeProvider {
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
  if (!mutatingProvider) {
    mutatingProvider = new DockerMutatingProvider(getMutatingDockerClient())
  }
  return mutatingProvider
}
