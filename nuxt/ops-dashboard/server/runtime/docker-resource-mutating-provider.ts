import type Docker from 'dockerode'
import { translateDockerNotFound } from './container-request'
import type {
  ImageMutatingProvider,
  NetworkMutatingProvider,
  VolumeMutatingProvider,
} from './resource-mutating-types'

/**
 * dockerode-backed implementations of the Phase 5 image/volume/network
 * mutating surface (named remove + prune). Kept in their own file, mirroring
 * how `docker-mutating-provider.ts` keeps the read-only `DockerProvider`
 * provably free of mutating calls. Each class here is constructed with its OWN
 * dockerode client (see singleton.ts's `getImageMutatingProvider`/
 * `getVolumeMutatingProvider`/`getNetworkMutatingProvider`), pointed at the
 * dedicated, THIRD `docker-socket-proxy-mutate-resources` proxy — never the
 * read-only proxy, and never the container-lifecycle mutate proxy either (see
 * docker-compose.ops.yml's residual-risk comment for why this app keeps all
 * three network paths separate: a compromised path to one mutate proxy should
 * not also grant the other mutate proxy's blast radius).
 *
 * Eligibility (zero references for images; Compose-label allowlist for
 * volumes/networks) is re-derived by `resource-mutation-guard.ts` BEFORE any
 * of these methods are called — nothing here re-checks it, matching
 * `DockerMutatingProvider`'s own "gating lives in the guard, not here" split.
 *
 * Prune filters are HARDCODED, never derived from any caller/route input —
 * this is the property that keeps "prune" dangling-/unused-only regardless of
 * what a future route handler is tempted to pass through (Option A's accepted
 * proxy-layer residual risk is narrowed back down at exactly this layer).
 */
export class DockerImageMutatingProvider implements ImageMutatingProvider {
  constructor(private readonly docker: Docker) {}

  async removeImage(id: string): Promise<{ deleted: string[] }> {
    try {
      const result: unknown = await this.docker.getImage(id).remove()
      return { deleted: this.extractDeleted(result) }
    } catch (err: unknown) {
      translateDockerNotFound(err, id, 'image')
    }
  }

  async pruneImages(): Promise<{ imagesDeleted: string[]; spaceReclaimed: number }> {
    // Hardcoded `dangling: true` — never accept this filter from a caller.
    // This is what keeps prune "unused images only", not an app-layer promise.
    const result = await this.docker.pruneImages({ filters: { dangling: ['true'] } })
    return {
      imagesDeleted: this.extractDeleted(result?.ImagesDeleted),
      spaceReclaimed: typeof result?.SpaceReclaimed === 'number' ? result.SpaceReclaimed : 0,
    }
  }

  /**
   * dockerode types image-remove/prune payloads loosely (`Promise<any>` on
   * `.remove()`; each `ImagesDeleted` entry as `{Untagged, Deleted}` with both
   * fields typed non-optional even though the real engine response only ever
   * populates one of the two per entry) — parsed defensively field-by-field
   * rather than trusting the type, same convention as `DockerProvider.mapHistory`.
   */
  private extractDeleted(raw: unknown): string[] {
    const entries = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []
    return entries
      .map((e) => (typeof e.Deleted === 'string' ? e.Deleted : null))
      .filter((v): v is string => v !== null)
  }
}

export class DockerVolumeMutatingProvider implements VolumeMutatingProvider {
  constructor(private readonly docker: Docker) {}

  async removeVolume(name: string): Promise<void> {
    try {
      await this.docker.getVolume(name).remove()
    } catch (err: unknown) {
      translateDockerNotFound(err, name, 'volume')
    }
  }

  async pruneVolumes(): Promise<{ volumesDeleted: string[]; spaceReclaimed: number }> {
    // No filters passed — the Engine API's own default volume prune already
    // only ever removes volumes with zero active container references.
    const result = await this.docker.pruneVolumes()
    return {
      volumesDeleted: Array.isArray(result?.VolumesDeleted) ? result.VolumesDeleted : [],
      spaceReclaimed: typeof result?.SpaceReclaimed === 'number' ? result.SpaceReclaimed : 0,
    }
  }
}

export class DockerNetworkMutatingProvider implements NetworkMutatingProvider {
  constructor(private readonly docker: Docker) {}

  async removeNetwork(id: string): Promise<void> {
    try {
      await this.docker.getNetwork(id).remove()
    } catch (err: unknown) {
      translateDockerNotFound(err, id, 'network')
    }
  }

  async pruneNetworks(): Promise<{ networksDeleted: string[] }> {
    // No filters passed — same "unused only" engine-level backstop as volumes.
    const result = await this.docker.pruneNetworks()
    return {
      networksDeleted: Array.isArray(result?.NetworksDeleted) ? result.NetworksDeleted : [],
    }
  }
}
