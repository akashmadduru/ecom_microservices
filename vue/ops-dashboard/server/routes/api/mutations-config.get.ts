import { getOpsConfig } from '../../runtime/config'

/**
 * Expose the two mutation-gating config values so the frontend can decide
 * whether to render mutation controls at all (rather than discovering the
 * feature is disabled only by attempting an action and getting a 403).
 *
 * Read-only and still behind the bearer-auth middleware. Returns ONLY the two
 * derived booleans/list — never the token or any other secret.
 */
export default defineEventHandler(() => {
  const { mutationsAllowed, managedServices } = getOpsConfig()
  return { allowed: mutationsAllowed, managedServices }
})
