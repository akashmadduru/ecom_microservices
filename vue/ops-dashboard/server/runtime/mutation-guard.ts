import { createError } from 'h3'
import { getOpsConfig } from './config'
import { translateDockerNotFound } from './container-request'
import { getMutatingProvider, getRuntimeProvider } from './singleton'

/**
 * Phase 2 mutation gate + audit trail.
 *
 * A single orchestrator (`runContainerMutation`) enforces the TWO independent
 * conditions that must BOTH hold before any container is stopped/started/
 * restarted, in the exact order the security design requires:
 *
 *   1. Global kill switch (`OPS_ALLOW_MUTATIONS === "true"`), checked FIRST —
 *      before we even inspect the container, so a globally-disabled instance
 *      leaks nothing about which services exist.
 *   2. Per-service allowlist (`OPS_MANAGED_SERVICES`), checked only after
 *      resolving the container's compose service via inspect. An unmanaged
 *      container (no compose label) can never be a target.
 *
 * The existing bearer-token auth middleware already covers these routes (they
 * live under /api/*), so token validation is not repeated here.
 */

export type MutationAction = 'stop' | 'start' | 'restart'

type MutationOutcome = 'denied' | 'attempt' | 'success' | 'error'

interface AuditEntry {
  action: MutationAction
  containerId: string
  containerName: string | null
  service: string | null
  allowed: boolean
  outcome: MutationOutcome
  error?: string
}

/**
 * Emit ONE structured audit line per mutation event to stdout.
 *
 * IDENTITY LIMITATION (read this before trusting the audit trail): this project
 * has a SINGLE shared operator token and no per-user identity, so "who" acted is
 * not resolvable beyond "someone in possession of OPS_API_TOKEN". These lines
 * are the only who-did-what-when record; they deliberately carry no principal
 * field because none exists to record. Ship logs to your aggregator if you need
 * durable retention — nothing here writes to a file or database by design.
 */
function logMutation(entry: AuditEntry): void {
  console.log(
    JSON.stringify({ event: 'ops.mutation', ts: new Date().toISOString(), ...entry }),
  )
}

function forbidden(message: string): never {
  throw createError({ statusCode: 403, statusMessage: 'Forbidden', message })
}

/**
 * Run a gated container mutation end to end. Assumes `id` has ALREADY been
 * validated by `assertValidContainerId` at the route boundary (the caller owns
 * that, so the 400-before-any-Docker-call guarantee stays in the route layer,
 * mirroring the read-only routes).
 *
 * Returns a small JSON body on success; throws a translated h3 error (403 for a
 * gate denial, 404 for a missing container, or the original error otherwise) on
 * failure. Every path — denied, attempted, succeeded, errored — is audit-logged.
 */
export async function runContainerMutation(
  action: MutationAction,
  id: string,
): Promise<{ ok: true; action: MutationAction; id: string }> {
  const { mutationsAllowed, managedServices } = getOpsConfig()

  // Bound once; every audit line for this request shares this shape, varying
  // only `allowed`/`outcome`/`error` — a single edit site if the schema
  // changes, instead of five hand-rebuilt object literals.
  let name: string | null = null
  let service: string | null = null
  const audit = (outcome: MutationOutcome, opts: { allowed: boolean; error?: string }): void =>
    logMutation({ action, containerId: id, containerName: name, service, outcome, ...opts })

  // (1) Global kill switch — before any inspect, so a disabled instance reveals
  // nothing about the containers it is running.
  if (!mutationsAllowed) {
    audit('denied', {
      allowed: false,
      error: 'mutations globally disabled (OPS_ALLOW_MUTATIONS is not "true")',
    })
    forbidden('Container mutations are globally disabled.')
  }

  // (2a) Resolve the container's compose service / managed status via the
  // existing read-only inspect path.
  const provider = getRuntimeProvider()
  let managed: boolean
  try {
    const detail = await provider.inspectContainer(id)
    name = detail.name
    service = detail.service
    managed = detail.managed
  } catch (err: unknown) {
    audit('error', { allowed: false, error: err instanceof Error ? err.message : 'inspect failed' })
    // translateDockerNotFound never returns; it throws a 404 or rethrows.
    translateDockerNotFound(err, id)
  }

  // (2b) Per-service allowlist. Unmanaged containers, and managed containers
  // whose service is not on the allowlist, are rejected identically.
  if (!managed || service === null || !managedServices.includes(service)) {
    audit('denied', { allowed: false, error: 'service not in OPS_MANAGED_SERVICES allowlist' })
    forbidden(
      `Service "${service ?? '(unmanaged)'}" is not in the mutation allowlist.`,
    )
  }

  // Record the ATTEMPT before the Docker call, so a call that then fails (or
  // never returns) is still on the record.
  audit('attempt', { allowed: true })

  const mutating = getMutatingProvider()
  try {
    if (action === 'stop') await mutating.stopContainer(id)
    else if (action === 'start') await mutating.startContainer(id)
    else await mutating.restartContainer(id)
  } catch (err: unknown) {
    audit('error', { allowed: true, error: err instanceof Error ? err.message : 'unknown error' })
    translateDockerNotFound(err, id)
  }

  audit('success', { allowed: true })

  return { ok: true, action, id }
}
