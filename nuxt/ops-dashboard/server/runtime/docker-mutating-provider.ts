import type Docker from 'dockerode'
import type { MutatingRuntimeProvider } from './mutating-types'

/**
 * dockerode-backed implementation of the Phase 2 mutating surface.
 *
 * Kept in its own file so the read-only `DockerProvider` (docker-provider.ts)
 * stays untouched and provably free of mutating calls. Uses its OWN dockerode
 * client (see singleton.ts's `getMutatingProvider`), pointed at a SEPARATE,
 * dedicated mutate-only docker-socket-proxy — never the same client/proxy as
 * the read-only side, and never the raw unix socket either way.
 *
 * Each method resolves to void: dockerode returns the raw engine response, but
 * routers only ever need "did it succeed or throw", so we discard the payload
 * and never leak a dockerode type upward.
 */
export class DockerMutatingProvider implements MutatingRuntimeProvider {
  constructor(private readonly docker: Docker) {}

  async stopContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).stop()
  }

  async startContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).start()
  }

  async restartContainer(id: string): Promise<void> {
    await this.docker.getContainer(id).restart()
  }
}
