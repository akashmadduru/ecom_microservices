import { createError } from 'h3'
import type { V1Pod } from '@kubernetes/client-node'
import type { HealthState } from './types'

/**
 * Pure Kubernetes → DTO mapping helpers, kept separate from the provider (which
 * owns the API calls) exactly the way parse.ts is kept separate from
 * docker-provider.ts. Everything here is deterministic and side-effect free, so
 * every mapping decision can be unit-tested without a cluster or a mocked
 * client.
 */

/**
 * Separator between the parts of an encoded pod id.
 *
 * `_` is deliberately chosen because it CANNOT appear inside any of the three
 * components it joins: Kubernetes namespace names and container names are
 * DNS-1123 *labels* (`[a-z0-9-]`) and pod names are DNS-1123 *subdomains*
 * (`[a-z0-9.-]`) — none of which admit an underscore. So splitting an encoded
 * id on `_` round-trips unambiguously. It is also inside the route boundary's
 * `assertValidContainerId` allowlist (`[a-zA-Z0-9_.-]`), unlike `/`, so the id
 * survives the same validation Docker container ids do.
 */
const POD_ID_SEP = '_'

export interface DecodedPodId {
  namespace: string
  name: string
  /**
   * Optional target container. Omitted for the 2-part ids produced by
   * `listContainers()` (which then default to the pod's first container for
   * logs); present only when a caller explicitly addresses one container of a
   * multi-container pod via a 3-part id.
   */
  container?: string
}

/**
 * Encode a pod's stable identity into the single-string `id` the RuntimeProvider
 * contract passes around (and that must round-trip back through
 * `inspectContainer(id)` / `streamLogs(id, ...)` the way a Docker container id
 * does). Format: `namespace_podname` (2 parts). Pod UID is deliberately NOT used
 * because it cannot be looked up by name via the API — the namespace+name pair
 * is what every downstream read needs.
 */
export function encodePodId(namespace: string, name: string): string {
  return `${namespace}${POD_ID_SEP}${name}`
}

/**
 * Decode an id produced by `encodePodId` (or a 3-part `namespace_name_container`
 * variant). Throws a proper h3 400 (not a plain Error) on a structurally
 * invalid id — the route boundary's `assertValidContainerId` has already
 * enforced the character allowlist, this enforces the part count; a bare
 * `Error` here would fall through the routes' `translateDockerNotFound` as an
 * unrecognized error and surface as a generic 500, when this is actually
 * exactly the same "malformed input" class `assertValidContainerId` already
 * reports as 400 for the Docker path.
 */
export function decodePodId(id: string): DecodedPodId {
  const parts = id.split(POD_ID_SEP)
  if (parts.length === 2) {
    const [namespace, name] = parts as [string, string]
    return { namespace, name }
  }
  if (parts.length === 3) {
    const [namespace, name, container] = parts as [string, string, string]
    return { namespace, name, container }
  }
  throw createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    message: `Invalid kubernetes pod id "${id}": expected "namespace_podname" or "namespace_podname_container".`,
  })
}

/** Container waiting reasons we treat as an unhealthy signal for a running pod. */
const UNHEALTHY_WAITING_REASONS = new Set([
  'CrashLoopBackOff',
  'ImagePullBackOff',
  'ErrImagePull',
  'CreateContainerError',
  'CreateContainerConfigError',
  'RunContainerError',
  'InvalidImageName',
])

/**
 * Derive a Docker-shaped `HealthState` from a pod's phase, `Ready` condition and
 * container waiting reasons. There is no exact Docker analog, so this is a
 * documented approximation:
 *
 *   - `Succeeded`  -> `none`      (ran to completion; no ongoing health notion,
 *                                  like a container with no healthcheck.)
 *   - `Failed`     -> `unhealthy` (terminated in error.)
 *   - `Unknown`    -> `unhealthy` (node lost contact; cannot be confirmed OK.)
 *   - `Pending`    -> `starting`  (still coming up.)
 *   - `Running`:
 *       * any container waiting with a crash/image-pull reason -> `unhealthy`
 *         (this is also the concrete signal behind a high `restartCount`);
 *       * else `Ready` condition == True                       -> `healthy`;
 *       * else (up but not yet Ready)                          -> `starting`.
 */
export function derivePodHealth(pod: V1Pod): HealthState {
  const phase = pod.status?.phase
  switch (phase) {
    case 'Succeeded':
      return 'none'
    case 'Failed':
    case 'Unknown':
      return 'unhealthy'
    case 'Pending':
      return 'starting'
    case 'Running': {
      const waitingCrash = (pod.status?.containerStatuses ?? []).some((cs) => {
        const reason = cs.state?.waiting?.reason
        return reason !== undefined && UNHEALTHY_WAITING_REASONS.has(reason)
      })
      if (waitingCrash) return 'unhealthy'
      const ready = (pod.status?.conditions ?? []).find((c) => c.type === 'Ready')
      return ready?.status === 'True' ? 'healthy' : 'starting'
    }
    default:
      return 'none'
  }
}

/**
 * ReplicaSet names are `<deployment>-<pod-template-hash>`, where the hash is a
 * short alphanumeric suffix. Strip it to recover the owning Deployment's name
 * WITHOUT a second API call (which would require RBAC on replicasets/deployments
 * this app deliberately does not ask for). If the suffix doesn't look like a
 * hash, the ReplicaSet name is returned unchanged.
 */
export function deploymentNameFromReplicaSet(replicaSetName: string): string {
  const match = replicaSetName.match(/^(.+)-[a-z0-9]{6,10}$/)
  return match?.[1] ?? replicaSetName
}

const OWNER_KINDS_DIRECT = new Set([
  'StatefulSet',
  'DaemonSet',
  'Job',
  'ReplicationController',
])

const SERVICE_NAME_LABEL = 'app.kubernetes.io/name'
const LEGACY_APP_LABEL = 'app'

/**
 * Resolve a pod's "service" — the closest analog to a Docker Compose service —
 * from its owner-reference chain, falling back to well-known labels. This is the
 * value used for `ContainerSummary.service` and the health rollup key.
 *
 * Resolution order:
 *   1. The controller owner reference (`controller: true`, else the first one):
 *      - `ReplicaSet` -> the owning Deployment name, derived by stripping the
 *        pod-template-hash suffix (see `deploymentNameFromReplicaSet`);
 *      - `StatefulSet` / `DaemonSet` / `Job` / `ReplicationController` -> used
 *        directly (these controllers own pods directly).
 *   2. Label fallback, checked ONLY when there is no usable owner reference:
 *      `app.kubernetes.io/name` first (the current Kubernetes recommended-labels
 *      standard), then the legacy `app` label (older manifests / Helm charts).
 *
 * Returns null when nothing resolves — such a pod is reported as unmanaged, just
 * like a Docker container with no compose labels.
 */
export function resolvePodService(pod: V1Pod): string | null {
  const owners = pod.metadata?.ownerReferences ?? []
  const owner = owners.find((o) => o.controller) ?? owners[0]
  if (owner) {
    if (owner.kind === 'ReplicaSet') {
      return deploymentNameFromReplicaSet(owner.name)
    }
    if (OWNER_KINDS_DIRECT.has(owner.kind)) {
      return owner.name
    }
  }

  const labels = pod.metadata?.labels ?? {}
  const labelValue = labels[SERVICE_NAME_LABEL] ?? labels[LEGACY_APP_LABEL]
  return labelValue ?? null
}

/** Collect a pod's IP(s) as informational strings (see provider's `networks`). */
export function podIps(pod: V1Pod): string[] {
  const ips = (pod.status?.podIPs ?? [])
    .map((entry) => entry.ip)
    .filter((ip): ip is string => Boolean(ip))
  if (ips.length > 0) return ips
  return pod.status?.podIP ? [pod.status.podIP] : []
}

/** Coerce a client-node timestamp (a Date, or occasionally a string) to ISO. */
export function k8sTimestampToIso(value: Date | string | undefined | null): string | null {
  if (!value) return null
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
  if (Number.isNaN(parsed)) return null
  return new Date(parsed).toISOString()
}
