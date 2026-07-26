import { describe, expect, it } from 'vitest'
import {
  assertTransitionAllowed,
  BUILD_REQUEST_STATES,
  InvalidTransitionError,
  isTerminalState,
  isTransitionAllowed,
  TRANSITIONS,
  type BuildRequestState,
} from '../src/state-machine.ts'

describe('state machine transitions', () => {
  it('allows every transition listed in the approved architecture', () => {
    const expected: [BuildRequestState, BuildRequestState[]][] = [
      ['requested', ['approved', 'rejected', 'expired', 'cancelled']],
      ['approved', ['building', 'expired', 'cancelled']],
      ['building', ['built', 'build_failed']],
      ['built', ['launch_requested', 'cancelled']],
      ['launch_requested', ['launch_approved', 'expired']],
      ['launch_approved', ['launched', 'launch_failed']],
      ['launched', ['torn_down']],
    ]

    for (const [from, tos] of expected) {
      for (const to of tos) {
        expect(isTransitionAllowed(from, to)).toBe(true)
      }
    }
  })

  it('every state referenced by TRANSITIONS is a real BuildRequestState', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...BUILD_REQUEST_STATES].sort())
  })

  it('terminal states have no outgoing transitions', () => {
    const terminals: BuildRequestState[] = [
      'torn_down',
      'rejected',
      'expired',
      'cancelled',
      'build_failed',
      'launch_failed',
    ]
    for (const terminal of terminals) {
      expect(isTerminalState(terminal)).toBe(true)
      expect(TRANSITIONS[terminal]).toHaveLength(0)
    }
  })

  it('rejects a transition not in the table', () => {
    expect(isTransitionAllowed('requested', 'launched')).toBe(false)
    expect(isTransitionAllowed('building', 'cancelled')).toBe(false)
    expect(isTransitionAllowed('launched', 'requested')).toBe(false)
  })

  it('assertTransitionAllowed throws InvalidTransitionError for a disallowed transition', () => {
    expect(() => assertTransitionAllowed('building', 'cancelled')).toThrow(InvalidTransitionError)
  })

  it('assertTransitionAllowed does not throw for an allowed transition', () => {
    expect(() => assertTransitionAllowed('requested', 'approved')).not.toThrow()
  })
})
