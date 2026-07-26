/**
 * The build+launch approval workflow's explicit, enumerated state machine.
 *
 * `TRANSITIONS` is the single source of truth for which state changes are
 * legal. Every route/service function that changes `build_requests.state`
 * MUST go through `assertTransitionAllowed` first -- there is no other,
 * implicit way to move a request from one state to another. A transition not
 * present in this table is rejected with a 409, never silently allowed.
 */
export const BUILD_REQUEST_STATES = [
  'requested',
  'approved',
  'building',
  'built',
  'launch_requested',
  'launch_approved',
  'launched',
  'torn_down',
  'rejected',
  'expired',
  'cancelled',
  'build_failed',
  'launch_failed',
] as const

export type BuildRequestState = (typeof BUILD_REQUEST_STATES)[number]

export const TRANSITIONS: Record<BuildRequestState, readonly BuildRequestState[]> = {
  requested: ['approved', 'rejected', 'expired', 'cancelled'],
  approved: ['building', 'expired', 'cancelled'],
  building: ['built', 'build_failed'],
  built: ['launch_requested', 'cancelled'],
  launch_requested: ['launch_approved', 'expired'],
  launch_approved: ['launched', 'launch_failed'],
  launched: ['torn_down'],
  // Terminal states: no outgoing transitions.
  torn_down: [],
  rejected: [],
  expired: [],
  cancelled: [],
  build_failed: [],
  launch_failed: [],
}

export class InvalidTransitionError extends Error {
  constructor(
    public readonly from: BuildRequestState,
    public readonly to: BuildRequestState,
  ) {
    super(`Transition "${from}" -> "${to}" is not allowed.`)
    this.name = 'InvalidTransitionError'
  }
}

export function isTransitionAllowed(from: BuildRequestState, to: BuildRequestState): boolean {
  return TRANSITIONS[from].includes(to)
}

/**
 * Throws `InvalidTransitionError` (callers translate this to an HTTP 409) if
 * `from -> to` is not an explicitly enumerated transition.
 */
export function assertTransitionAllowed(from: BuildRequestState, to: BuildRequestState): void {
  if (!isTransitionAllowed(from, to)) {
    throw new InvalidTransitionError(from, to)
  }
}

export function isTerminalState(state: BuildRequestState): boolean {
  return TRANSITIONS[state].length === 0
}
