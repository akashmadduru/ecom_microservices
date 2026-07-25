import { createError } from 'h3'
import { getOpsConfig } from './config'
import { translateDockerNotFound } from './container-request'
import {
  getImageMutatingProvider,
  getNetworkMutatingProvider,
  getRuntimeProvider,
  getVolumeMutatingProvider,
} from './singleton'

/**
 * Phase 5 mutation gate + audit trail for image/volume/network named-remove
 * and prune. Mirrors `mutation-guard.ts`'s two-gate pattern (global kill
 * switch, then a per-target eligibility check re-derived server-side, then
 * attempt/success/error audit) but lives in its OWN file, on purpose:
 * `mutation-guard.ts` itself is left completely untouched by this phase, so
 * the existing container mutation gate's behavior/audit shape is provably
 * unaffected by anything built here.
 *
 * Every function below rejects kubernetes mode FIRST, before any inspect or
 * provider construction — mutations are Docker-only, matching
 * `runContainerMutation`'s existing k8s rejection.
 *
 * Audit lines share the container guard's shape (one structured JSON line per
 * attempt/success/denied/error) but a distinct event name, `ops.resource_mutation`,
 * and `resourceType`/`resourceId` fields in place of `service`/`containerId` —
 * so a log consumer can tell the two mutation surfaces apart without parsing
 * free-text.
 */

export type ResourceKind = 'image' | 'volume' | 'network'
type ResourceAction = 'remove' | 'prune'
type ResourceOutcome = 'denied' | 'attempt' | 'success' | 'error'

interface ResourceAuditEntry {
  resourceType: ResourceKind
  action: ResourceAction
  /** null for prune — there is no single target. */
  resourceId: string | null
  allowed: boolean
  outcome: ResourceOutcome
  error?: string
}

function logResourceMutation(entry: ResourceAuditEntry): void {
  console.log(
    JSON.stringify({ event: 'ops.resource_mutation', ts: new Date().toISOString(), ...entry }),
  )
}

function forbidden(message: string): never {
  throw createError({ statusCode: 403, statusMessage: 'Forbidden', message })
}

/**
 * Reject kubernetes mode with an explicit 501 before any inspect or provider
 * construction — never returns in that mode. Mirrors
 * `runContainerMutation`'s existing k8s rejection.
 */
function rejectKubernetesMode(action: ResourceAction): void {
  const { runtimeMode } = getOpsConfig()
  if (runtimeMode === 'kubernetes') {
    throw createError({
      statusCode: 501,
      statusMessage: 'Not Implemented',
      message: `Resource ${action === 'remove' ? 'removal' : 'prune'} is not supported in kubernetes mode.`,
    })
  }
}

/**
 * Gate 1 for every resource mutation (remove AND prune alike): the global
 * kill switch, checked FIRST — before any inspect or provider work, so a
 * globally-disabled instance reveals nothing about what it's running. Every
 * one of the six entry points below opens with this exact check, so it's
 * factored here instead of repeated six times.
 */
function assertResourceMutationsEnabled(
  audit: (outcome: ResourceOutcome, opts: { allowed: boolean; error?: string }) => void,
): void {
  const { resourceMutationsAllowed } = getOpsConfig()
  if (!resourceMutationsAllowed) {
    audit('denied', {
      allowed: false,
      error: 'resource mutations globally disabled (OPS_ALLOW_RESOURCE_MUTATIONS is not "true")',
    })
    forbidden('Resource mutations are globally disabled.')
  }
}

const COMPOSE_VOLUME_LABEL = 'com.docker.compose.volume'
const COMPOSE_NETWORK_LABEL = 'com.docker.compose.network'

// ---------------------------------------------------------------------------
// Named remove — two gates, mirrors runContainerMutation exactly.
// ---------------------------------------------------------------------------

export interface ResourceRemovalResult {
  ok: true
  action: 'remove'
  resourceType: ResourceKind
  id: string
}

/**
 * Remove ONE image by digest id.
 *
 * Gate 2 for images is a DELIBERATE DEVIATION from the config-based allowlist
 * shape used for volumes/networks (and containers): images have no Compose
 * label identity to allowlist against — an image can back zero or many
 * containers at once, unlike a container, which has exactly one compose
 * service. So eligibility here is "zero live container references,"
 * re-derived via a fresh `inspectImage` call, NOT a client-supplied claim and
 * NOT a configured name list.
 */
export async function runImageRemoval(id: string): Promise<ResourceRemovalResult & { deleted: string[] }> {
  rejectKubernetesMode('remove')

  const audit = (outcome: ResourceOutcome, opts: { allowed: boolean; error?: string }): void =>
    logResourceMutation({ resourceType: 'image', action: 'remove', resourceId: id, outcome, ...opts })

  assertResourceMutationsEnabled(audit)

  const provider = getRuntimeProvider()
  let containerCount: number
  try {
    const detail = await provider.inspectImage(id)
    containerCount = detail.containerCount
  } catch (err: unknown) {
    audit('error', { allowed: false, error: err instanceof Error ? err.message : 'inspect failed' })
    // translateDockerNotFound never returns; it throws a 404 or rethrows.
    translateDockerNotFound(err, id, 'image')
  }

  if (containerCount > 0) {
    audit('denied', { allowed: false, error: `image is referenced by ${containerCount} container(s)` })
    forbidden(`Image "${id}" is referenced by ${containerCount} container(s) and cannot be removed.`)
  }

  audit('attempt', { allowed: true })
  const mutating = getImageMutatingProvider()
  let result: { deleted: string[] }
  try {
    result = await mutating.removeImage(id)
  } catch (err: unknown) {
    audit('error', { allowed: true, error: err instanceof Error ? err.message : 'unknown error' })
    translateDockerNotFound(err, id, 'image')
  }

  audit('success', { allowed: true })
  return { ok: true, action: 'remove', resourceType: 'image', id, deleted: result.deleted }
}

/**
 * Remove ONE volume by name. Gate 2 is the Compose-label allowlist,
 * re-derived via a fresh `inspectVolume` call: the volume's
 * `com.docker.compose.volume` label value must be present AND in
 * `managedVolumes` — same pattern as `OPS_MANAGED_SERVICES` for containers.
 */
export async function runVolumeRemoval(name: string): Promise<ResourceRemovalResult> {
  rejectKubernetesMode('remove')

  const audit = (outcome: ResourceOutcome, opts: { allowed: boolean; error?: string }): void =>
    logResourceMutation({ resourceType: 'volume', action: 'remove', resourceId: name, outcome, ...opts })

  assertResourceMutationsEnabled(audit)
  const { managedVolumes } = getOpsConfig()

  const provider = getRuntimeProvider()
  let label: string | null
  try {
    const detail = await provider.inspectVolume(name)
    label = detail.labels[COMPOSE_VOLUME_LABEL] ?? null
  } catch (err: unknown) {
    audit('error', { allowed: false, error: err instanceof Error ? err.message : 'inspect failed' })
    translateDockerNotFound(err, name, 'volume')
  }

  if (label === null || !managedVolumes.includes(label)) {
    audit('denied', { allowed: false, error: 'volume not in OPS_MANAGED_VOLUMES allowlist' })
    forbidden(`Volume "${name}" is not in the mutation allowlist.`)
  }

  audit('attempt', { allowed: true })
  const mutating = getVolumeMutatingProvider()
  try {
    await mutating.removeVolume(name)
  } catch (err: unknown) {
    audit('error', { allowed: true, error: err instanceof Error ? err.message : 'unknown error' })
    translateDockerNotFound(err, name, 'volume')
  }

  audit('success', { allowed: true })
  return { ok: true, action: 'remove', resourceType: 'volume', id: name }
}

/**
 * Remove ONE network by id. Gate 2 is the Compose-label allowlist, re-derived
 * via a fresh `inspectNetwork` call: the network's `com.docker.compose.network`
 * label value must be present AND in `managedNetworks` — same pattern as
 * volumes/containers.
 */
export async function runNetworkRemoval(id: string): Promise<ResourceRemovalResult> {
  rejectKubernetesMode('remove')

  const audit = (outcome: ResourceOutcome, opts: { allowed: boolean; error?: string }): void =>
    logResourceMutation({ resourceType: 'network', action: 'remove', resourceId: id, outcome, ...opts })

  assertResourceMutationsEnabled(audit)
  const { managedNetworks } = getOpsConfig()

  const provider = getRuntimeProvider()
  let label: string | null
  try {
    const detail = await provider.inspectNetwork(id)
    label = detail.labels[COMPOSE_NETWORK_LABEL] ?? null
  } catch (err: unknown) {
    audit('error', { allowed: false, error: err instanceof Error ? err.message : 'inspect failed' })
    translateDockerNotFound(err, id, 'network')
  }

  if (label === null || !managedNetworks.includes(label)) {
    audit('denied', { allowed: false, error: 'network not in OPS_MANAGED_NETWORKS allowlist' })
    forbidden(`Network "${id}" is not in the mutation allowlist.`)
  }

  audit('attempt', { allowed: true })
  const mutating = getNetworkMutatingProvider()
  try {
    await mutating.removeNetwork(id)
  } catch (err: unknown) {
    audit('error', { allowed: true, error: err instanceof Error ? err.message : 'unknown error' })
    translateDockerNotFound(err, id, 'network')
  }

  audit('success', { allowed: true })
  return { ok: true, action: 'remove', resourceType: 'network', id }
}

// ---------------------------------------------------------------------------
// Prune — SINGLE gate only. There is no target, so there is deliberately no
// gate 2 / per-target eligibility check here — this is intentional, not a
// missed gate. Docker's own engine-level prune is itself scoped to unused
// resources (dangling images; volumes/networks with zero active container
// references), which is the real backstop for "prune can't touch something in
// use," not an app-layer allowlist. For the same reason, failures below
// rethrow the raw error rather than going through `translateDockerNotFound`
// (also deliberate, not a missed call) — that helper translates a "no such
// target" error into a 404 for a single named id, which doesn't apply to a
// targetless bulk operation.
// ---------------------------------------------------------------------------

export interface ResourcePruneResult {
  ok: true
  action: 'prune'
  resourceType: ResourceKind
}

export async function runImagePrune(): Promise<
  ResourcePruneResult & { imagesDeleted: string[]; spaceReclaimed: number }
> {
  rejectKubernetesMode('prune')

  const audit = (outcome: ResourceOutcome, opts: { allowed: boolean; error?: string }): void =>
    logResourceMutation({ resourceType: 'image', action: 'prune', resourceId: null, outcome, ...opts })

  assertResourceMutationsEnabled(audit)

  audit('attempt', { allowed: true })
  const mutating = getImageMutatingProvider()
  let result: { imagesDeleted: string[]; spaceReclaimed: number }
  try {
    result = await mutating.pruneImages()
  } catch (err: unknown) {
    audit('error', { allowed: true, error: err instanceof Error ? err.message : 'unknown error' })
    throw err
  }

  audit('success', { allowed: true })
  return { ok: true, action: 'prune', resourceType: 'image', ...result }
}

export async function runVolumePrune(): Promise<
  ResourcePruneResult & { volumesDeleted: string[]; spaceReclaimed: number }
> {
  rejectKubernetesMode('prune')

  const audit = (outcome: ResourceOutcome, opts: { allowed: boolean; error?: string }): void =>
    logResourceMutation({ resourceType: 'volume', action: 'prune', resourceId: null, outcome, ...opts })

  assertResourceMutationsEnabled(audit)

  audit('attempt', { allowed: true })
  const mutating = getVolumeMutatingProvider()
  let result: { volumesDeleted: string[]; spaceReclaimed: number }
  try {
    result = await mutating.pruneVolumes()
  } catch (err: unknown) {
    audit('error', { allowed: true, error: err instanceof Error ? err.message : 'unknown error' })
    throw err
  }

  audit('success', { allowed: true })
  return { ok: true, action: 'prune', resourceType: 'volume', ...result }
}

export async function runNetworkPrune(): Promise<ResourcePruneResult & { networksDeleted: string[] }> {
  rejectKubernetesMode('prune')

  const audit = (outcome: ResourceOutcome, opts: { allowed: boolean; error?: string }): void =>
    logResourceMutation({ resourceType: 'network', action: 'prune', resourceId: null, outcome, ...opts })

  assertResourceMutationsEnabled(audit)

  audit('attempt', { allowed: true })
  const mutating = getNetworkMutatingProvider()
  let result: { networksDeleted: string[] }
  try {
    result = await mutating.pruneNetworks()
  } catch (err: unknown) {
    audit('error', { allowed: true, error: err instanceof Error ? err.message : 'unknown error' })
    throw err
  }

  audit('success', { allowed: true })
  return { ok: true, action: 'prune', resourceType: 'network', ...result }
}
