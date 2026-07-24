/**
 * Central resolution of operator-facing environment variables.
 *
 * Read from `process.env` directly (not just useRuntimeConfig) so the exact
 * documented names — OPS_API_TOKEN / DOCKER_HOST / DOCKER_PORT — are honored at
 * *runtime*, even for a production `node .output/server/index.mjs` start where
 * Nuxt would otherwise only re-read NUXT_-prefixed vars.
 */

export interface OpsConfig {
  /** The expected operator bearer token. Empty string means "unset". */
  opsApiToken: string
  /** Hostname of the read-only docker-socket-proxy. */
  dockerHost: string
  /** TCP port of the socket proxy. */
  dockerPort: number
}

export function getOpsConfig(): OpsConfig {
  const rawPort = process.env.DOCKER_PORT ?? '2375'
  const parsedPort = Number.parseInt(rawPort, 10)
  return {
    opsApiToken: process.env.OPS_API_TOKEN ?? '',
    dockerHost: process.env.DOCKER_HOST ?? 'docker-socket-proxy',
    dockerPort: Number.isNaN(parsedPort) ? 2375 : parsedPort,
  }
}
