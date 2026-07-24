import Docker from 'dockerode'
import { getOpsConfig } from './config'
import { DockerProvider } from './docker-provider'
import type { RuntimeProvider } from './types'

/**
 * One shared Docker() client + provider for the whole server process.
 *
 * The client ALWAYS talks TCP to the socket proxy (host + port) — never a unix
 * socket path. Touching /var/run/docker.sock directly is root-equivalent and is
 * exactly what the proxy exists to prevent, so there is no unix-socket branch
 * here on purpose.
 */

let dockerClient: Docker | null = null
let provider: RuntimeProvider | null = null

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
