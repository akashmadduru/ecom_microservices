import type pg from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConflictError, ForbiddenError, ServiceUnavailableError, ValidationError } from '../src/errors.ts'
import type { GitAncestorGuard } from '../src/git-ancestor-guard.ts'
import type { ApprovalNotifier } from '../src/notifier/types.ts'
import { createBuildRequestService } from '../src/service/build-request-service.ts'
import { FakeDb } from './helpers/fake-db.ts'

function makeGuard(ok: boolean): GitAncestorGuard {
  return {
    verifyAncestor: vi.fn(async () =>
      ok ? { ok: true, resolvedSha: 'abc123' } : { ok: false, reason: 'not an ancestor of main' },
    ),
  }
}

function makeNotifier(shouldFail: boolean): ApprovalNotifier & { calls: unknown[][] } {
  const calls: unknown[][] = []
  return {
    calls,
    async sendApprovalCode(requestId, code, context) {
      calls.push([requestId, code, context])
      if (shouldFail) throw new Error('slack webhook unreachable')
    },
  }
}

describe('build-request-service: createBuildRequest validation order', () => {
  let db: FakeDb

  beforeEach(() => {
    db = new FakeDb()
  })

  it('rejects an unlisted target before ever consulting GitAncestorGuard or the notifier', async () => {
    const guard = makeGuard(true)
    const notifier = makeNotifier(false)
    const service = createBuildRequestService({
      pool: db as unknown as pg.Pool,
      notifier,
      gitAncestorGuard: guard,
      config: { approvalCodeTtlMinutes: 15 },
    })

    await expect(
      service.createBuildRequest({
        target: 'not-a-real-target',
        gitRef: 'main',
        reason: 'testing',
        requesterSignal: '127.0.0.1@now',
      }),
    ).rejects.toBeInstanceOf(ValidationError)

    expect(guard.verifyAncestor).not.toHaveBeenCalled()
    expect(notifier.calls).toHaveLength(0)
    expect(db.requestCount).toBe(0)
  })

  it('rejects an empty gitRef before consulting GitAncestorGuard', async () => {
    const guard = makeGuard(true)
    const service = createBuildRequestService({
      pool: db as unknown as pg.Pool,
      notifier: makeNotifier(false),
      gitAncestorGuard: guard,
      config: { approvalCodeTtlMinutes: 15 },
    })

    await expect(
      service.createBuildRequest({
        target: 'ops-dashboard',
        gitRef: '   ',
        reason: 'testing',
        requesterSignal: '127.0.0.1@now',
      }),
    ).rejects.toBeInstanceOf(ValidationError)

    expect(guard.verifyAncestor).not.toHaveBeenCalled()
    expect(db.requestCount).toBe(0)
  })

  it('rejects an empty reason', async () => {
    const service = createBuildRequestService({
      pool: db as unknown as pg.Pool,
      notifier: makeNotifier(false),
      gitAncestorGuard: makeGuard(true),
      config: { approvalCodeTtlMinutes: 15 },
    })

    await expect(
      service.createBuildRequest({
        target: 'ops-dashboard',
        gitRef: 'main',
        reason: '',
        requesterSignal: '127.0.0.1@now',
      }),
    ).rejects.toBeInstanceOf(ValidationError)
  })

  it('rejects when GitAncestorGuard rejects the ref, and never creates a row', async () => {
    const guard = makeGuard(false)
    const notifier = makeNotifier(false)
    const service = createBuildRequestService({
      pool: db as unknown as pg.Pool,
      notifier,
      gitAncestorGuard: guard,
      config: { approvalCodeTtlMinutes: 15 },
    })

    await expect(
      service.createBuildRequest({
        target: 'ops-dashboard',
        gitRef: 'some-untrusted-ref',
        reason: 'testing',
        requesterSignal: '127.0.0.1@now',
      }),
    ).rejects.toThrow(/not an ancestor of main/)

    expect(guard.verifyAncestor).toHaveBeenCalledWith('some-untrusted-ref')
    expect(notifier.calls).toHaveLength(0)
    expect(db.requestCount).toBe(0)
  })

  it('creates a row in "requested" state and notifies once every prior step passes', async () => {
    const notifier = makeNotifier(false)
    const service = createBuildRequestService({
      pool: db as unknown as pg.Pool,
      notifier,
      gitAncestorGuard: makeGuard(true),
      config: { approvalCodeTtlMinutes: 15 },
    })

    const result = await service.createBuildRequest({
      target: 'ops-dashboard',
      gitRef: 'main',
      reason: 'testing',
      requesterSignal: '127.0.0.1@now',
    })

    expect(result.state).toBe('requested')
    expect(db.requestCount).toBe(1)
    expect(notifier.calls).toHaveLength(1)

    const row = db.getCommittedRequest(result.requestId)
    expect(row?.approval_code_hash).toBeTruthy()
    // The plaintext code handed to the notifier must never equal the stored hash.
    expect(notifier.calls[0]?.[1]).not.toEqual(row?.approval_code_hash)
  })

  it('fails closed (503) and creates NO row at all if the notifier throws', async () => {
    const notifier = makeNotifier(true)
    const service = createBuildRequestService({
      pool: db as unknown as pg.Pool,
      notifier,
      gitAncestorGuard: makeGuard(true),
      config: { approvalCodeTtlMinutes: 15 },
    })

    await expect(
      service.createBuildRequest({
        target: 'ops-dashboard',
        gitRef: 'main',
        reason: 'testing',
        requesterSignal: '127.0.0.1@now',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError)

    // The whole transaction -- including the INSERT that happened before the
    // notifier call -- must have rolled back. No dangling "requested" row
    // with an approval code nobody was ever told.
    expect(db.requestCount).toBe(0)
  })
})

describe('build-request-service: approve / launch / cancel', () => {
  let db: FakeDb

  beforeEach(() => {
    db = new FakeDb()
  })

  async function createRequested() {
    const notifier = makeNotifier(false)
    const service = createBuildRequestService({
      pool: db as unknown as pg.Pool,
      notifier,
      gitAncestorGuard: makeGuard(true),
      config: { approvalCodeTtlMinutes: 15 },
    })
    const created = await service.createBuildRequest({
      target: 'ops-dashboard',
      gitRef: 'main',
      reason: 'testing',
      requesterSignal: '127.0.0.1@now',
    })
    const plaintextCode = notifier.calls[0]?.[1] as string
    return { service, notifier, requestId: created.requestId, plaintextCode }
  }

  it('approves with a correct code and transitions requested -> approved', async () => {
    const { service, requestId, plaintextCode } = await createRequested()
    const result = await service.approveBuildRequest(requestId, plaintextCode, '127.0.0.1@later')
    expect(result.state).toBe('approved')
  })

  it('rejects an incorrect approval code with 403 and records a "denied" audit row', async () => {
    const { service, requestId } = await createRequested()
    await expect(
      service.approveBuildRequest(requestId, 'totally-wrong-code', '127.0.0.1@later'),
    ).rejects.toBeInstanceOf(ForbiddenError)

    const deniedEntries = db.auditLog.filter((e) => e.outcome === 'denied')
    expect(deniedEntries.length).toBeGreaterThan(0)

    // The row must still be in "requested" -- a denied approval is not a transition.
    const row = db.getCommittedRequest(requestId)
    expect(row?.state).toBe('requested')
  })

  it('rejects approving a request that is not in "requested" state with 409, via the transition table', async () => {
    const { service, requestId, plaintextCode } = await createRequested()
    await service.approveBuildRequest(requestId, plaintextCode, '127.0.0.1@later')

    // Already approved -- approving again is not an allowed transition.
    await expect(
      service.approveBuildRequest(requestId, plaintextCode, '127.0.0.1@later'),
    ).rejects.toBeInstanceOf(ConflictError)
  })

  it('returns 404 (as NotFoundError) for an unknown request id', async () => {
    const service = createBuildRequestService({
      pool: db as unknown as pg.Pool,
      notifier: makeNotifier(false),
      gitAncestorGuard: makeGuard(true),
      config: { approvalCodeTtlMinutes: 15 },
    })
    await expect(service.getBuildRequest('00000000-0000-0000-0000-000000000000')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('cancel is allowed from "requested" and moves to "cancelled"', async () => {
    const { service, requestId } = await createRequested()
    const result = await service.cancelBuildRequest(requestId)
    expect(result.state).toBe('cancelled')
  })

  it('cancel is rejected (409) once already cancelled -- terminal states have no outgoing transitions', async () => {
    const { service, requestId } = await createRequested()
    await service.cancelBuildRequest(requestId)
    await expect(service.cancelBuildRequest(requestId)).rejects.toBeInstanceOf(ConflictError)
  })

  it('getBuildRequest never exposes the approval code hash fields', async () => {
    const { service, requestId } = await createRequested()
    const publicRow = await service.getBuildRequest(requestId)
    expect(publicRow).not.toHaveProperty('approval_code_hash')
    expect(publicRow).not.toHaveProperty('launch_approval_code_hash')
  })
})
