import { getOpsConfig } from '../../runtime/config'

/**
 * Expose the Phase 5 resource-mutation-gating config so the frontend can
 * decide whether to render image/volume/network mutation controls at all.
 * Deliberately a SEPARATE endpoint from `/api/mutations-config` (Phase 2's
 * container gate) — that route's `{allowed, managedServices}` contract is
 * untouched, and `ContainerActions.vue` keeps depending on it exactly as-is.
 *
 * No managed-list is returned for images: eligibility there is STATE-based
 * (zero live container references), not a configured name allowlist, so
 * there is nothing list-shaped to expose — the frontend mirrors the
 * server-side gate by checking each image's own `containerCount === 0`
 * instead (see `ImageActions.vue`).
 */
export default defineEventHandler(() => {
  const { resourceMutationsAllowed, managedVolumes, managedNetworks } = getOpsConfig()
  return { allowed: resourceMutationsAllowed, managedVolumes, managedNetworks }
})
