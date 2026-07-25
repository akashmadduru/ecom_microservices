/**
 * Phase 5 mutating interfaces for images/volumes/networks: named remove + prune.
 *
 * Deliberately NOT folded into `MutatingRuntimeProvider` (`mutating-types.ts`).
 * That interface's own doc comment promises exactly stop/start/restart and
 * explicitly states there is "deliberately NO create / remove / exec / rebuild
 * here" for containers — widening it to cover image/volume/network removal
 * would break that documented guarantee for every existing caller that holds a
 * `MutatingRuntimeProvider` and assumes it can never delete anything. These are
 * new, separate, sibling interfaces instead, the same way `MutatingRuntimeProvider`
 * itself is kept separate from the read-only `RuntimeProvider` (`types.ts`).
 *
 * Each `remove*` method takes ONLY the resource identifier. Eligibility — zero
 * live container/pod references for images; the Compose-label allowlist for
 * volumes/networks — is re-derived server-side by `resource-mutation-guard.ts`
 * BEFORE any of these methods is ever called. The methods themselves do not
 * check eligibility and must never be called directly from a route handler.
 *
 * Each `prune*` method takes NO parameters at all — there is no per-target
 * eligibility to thread through, by design (see `resource-mutation-guard.ts`'s
 * prune entry points). Docker's own engine-level prune only ever removes
 * UNUSED resources (dangling images; volumes/networks with zero active
 * container references), which is a real engine-level backstop, not merely
 * app-layer discipline — the Docker-backed implementations in
 * `docker-resource-mutating-provider.ts` hardcode the relevant filters (e.g.
 * `dangling: true` for images) rather than accepting any caller-supplied
 * filter, specifically so a future route handler can never widen what gets
 * pruned by passing something through.
 */

export interface ImageMutatingProvider {
  /**
   * Removes ONE image by digest id. Eligibility (zero live container/pod
   * references) is re-derived server-side by the guard before this is ever
   * called — this method itself does not check eligibility.
   */
  removeImage(id: string): Promise<{ deleted: string[] }>
  /**
   * Removes ALL dangling (untagged, unreferenced) images. Takes no parameter —
   * Docker's own engine only ever prunes unused resources, which is a real
   * engine-level backstop, not just app discipline.
   */
  pruneImages(): Promise<{ imagesDeleted: string[]; spaceReclaimed: number }>
}

export interface VolumeMutatingProvider {
  /** Removes ONE volume by name. Eligibility (Compose-label allowlist) is
   *  re-derived server-side by the guard before this is ever called. */
  removeVolume(name: string): Promise<void>
  /** Removes all volumes Docker itself considers unused (zero active container
   *  references). No target, no per-target eligibility check needed. */
  pruneVolumes(): Promise<{ volumesDeleted: string[]; spaceReclaimed: number }>
}

export interface NetworkMutatingProvider {
  /** Removes ONE network by id. Eligibility (Compose-label allowlist) is
   *  re-derived server-side by the guard before this is ever called. */
  removeNetwork(id: string): Promise<void>
  /** Removes all networks Docker itself considers unused. No target, no
   *  per-target eligibility check needed. */
  pruneNetworks(): Promise<{ networksDeleted: string[] }>
}
