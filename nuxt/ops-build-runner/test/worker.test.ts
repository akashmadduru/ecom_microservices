import type pg from 'pg'
import { describe, expect, it, vi } from 'vitest'
import { startWorker } from '../src/worker.ts'
import { FakeDb } from './helpers/fake-db.ts'

function fakeOrchestrators() {
  return {
    buildOrchestrator: { runBuild: vi.fn(async () => undefined) },
    launchOrchestrator: { runLaunch: vi.fn(async () => undefined), tearDown: vi.fn(async () => undefined) },
  }
}

/** Runs one worker tick and waits for it to settle, without waiting for the next poll. */
async function runOneTick(deps: Parameters<typeof startWorker>[0]): Promise<void> {
  const worker = startWorker({ ...deps, pollIntervalMs: 10_000_000 }) // never actually fires a second tick in this test
  // The first tick is scheduled via setTimeout(fn, 0) -- flush microtasks/timers.
  await new Promise((resolve) => setTimeout(resolve, 20))
  worker.stop()
}

describe('worker', () => {
  it('picks up the oldest approved row and builds it', async () => {
    const db = new FakeDb()
    const older = db.seedRow({ state: 'approved', created_at: new Date(Date.now() - 60_000) })
    db.seedRow({ state: 'approved', created_at: new Date() })
    const { buildOrchestrator, launchOrchestrator } = fakeOrchestrators()

    await runOneTick({
      pool: db as unknown as pg.Pool,
      buildOrchestrator: buildOrchestrator as never,
      launchOrchestrator: launchOrchestrator as never,
      approvalCodeTtlMinutes: 15,
      pollIntervalMs: 10,
    })

    expect(buildOrchestrator.runBuild).toHaveBeenCalledTimes(1)
    expect(buildOrchestrator.runBuild).toHaveBeenCalledWith(older.request_id)
  })

  it('does not start a new build while one is already building (serialized, one at a time)', async () => {
    const db = new FakeDb()
    db.seedRow({ state: 'building' })
    db.seedRow({ state: 'approved' })
    const { buildOrchestrator, launchOrchestrator } = fakeOrchestrators()

    await runOneTick({
      pool: db as unknown as pg.Pool,
      buildOrchestrator: buildOrchestrator as never,
      launchOrchestrator: launchOrchestrator as never,
      approvalCodeTtlMinutes: 15,
      pollIntervalMs: 10,
    })

    expect(buildOrchestrator.runBuild).not.toHaveBeenCalled()
  })

  it('picks up a launch_approved row and launches it', async () => {
    const db = new FakeDb()
    const row = db.seedRow({ state: 'launch_approved', launch_approved_at: new Date() })
    const { buildOrchestrator, launchOrchestrator } = fakeOrchestrators()

    await runOneTick({
      pool: db as unknown as pg.Pool,
      buildOrchestrator: buildOrchestrator as never,
      launchOrchestrator: launchOrchestrator as never,
      approvalCodeTtlMinutes: 15,
      pollIntervalMs: 10,
    })

    expect(launchOrchestrator.runLaunch).toHaveBeenCalledWith(row.request_id)
  })

  it('tears down a launched row past its TTL', async () => {
    const db = new FakeDb()
    const row = db.seedRow({
      state: 'launched',
      ttl_expires_at: new Date(Date.now() - 1000),
      launch_container_id: 'c1',
    })
    const { buildOrchestrator, launchOrchestrator } = fakeOrchestrators()

    await runOneTick({
      pool: db as unknown as pg.Pool,
      buildOrchestrator: buildOrchestrator as never,
      launchOrchestrator: launchOrchestrator as never,
      approvalCodeTtlMinutes: 15,
      pollIntervalMs: 10,
    })

    expect(launchOrchestrator.tearDown).toHaveBeenCalledWith(row.request_id)
  })

  it('does not tear down a launched row that has not yet reached its TTL', async () => {
    const db = new FakeDb()
    db.seedRow({ state: 'launched', ttl_expires_at: new Date(Date.now() + 60_000), launch_container_id: 'c1' })
    const { buildOrchestrator, launchOrchestrator } = fakeOrchestrators()

    await runOneTick({
      pool: db as unknown as pg.Pool,
      buildOrchestrator: buildOrchestrator as never,
      launchOrchestrator: launchOrchestrator as never,
      approvalCodeTtlMinutes: 15,
      pollIntervalMs: 10,
    })

    expect(launchOrchestrator.tearDown).not.toHaveBeenCalled()
  })

  it('expires a "requested" row once its build-approval code window has passed', async () => {
    const db = new FakeDb()
    const row = db.seedRow({ state: 'requested', created_at: new Date(Date.now() - 20 * 60_000) })
    const { buildOrchestrator, launchOrchestrator } = fakeOrchestrators()

    await runOneTick({
      pool: db as unknown as pg.Pool,
      buildOrchestrator: buildOrchestrator as never,
      launchOrchestrator: launchOrchestrator as never,
      approvalCodeTtlMinutes: 15,
      pollIntervalMs: 10,
    })

    expect(db.getCommittedRequest(row.request_id)?.state).toBe('expired')
    const expireEvent = db.auditLog.find((e) => e.event === 'build_request.expire')
    expect(expireEvent?.outcome).toBe('success')
  })

  it('expires an "approved" row that was never built within the TTL window', async () => {
    const db = new FakeDb()
    const row = db.seedRow({ state: 'approved', approved_at: new Date(Date.now() - 20 * 60_000) })
    const { buildOrchestrator, launchOrchestrator } = fakeOrchestrators()

    await runOneTick({
      pool: db as unknown as pg.Pool,
      buildOrchestrator: buildOrchestrator as never,
      launchOrchestrator: launchOrchestrator as never,
      approvalCodeTtlMinutes: 15,
      pollIntervalMs: 10,
    })

    expect(db.getCommittedRequest(row.request_id)?.state).toBe('expired')
  })

  it('never sweeps "launch_approved" to expired -- the state machine has no such transition', async () => {
    const db = new FakeDb()
    const row = db.seedRow({ state: 'launch_approved', launch_requested_at: new Date(Date.now() - 20 * 60_000) })
    const { buildOrchestrator, launchOrchestrator } = fakeOrchestrators()
    // Prevent the worker from also picking this row up as a launch action for this assertion's purposes.
    launchOrchestrator.runLaunch = vi.fn(async () => undefined)

    await runOneTick({
      pool: db as unknown as pg.Pool,
      buildOrchestrator: buildOrchestrator as never,
      launchOrchestrator: launchOrchestrator as never,
      approvalCodeTtlMinutes: 15,
      pollIntervalMs: 10,
    })

    // Still launch_approved (or launched, if the picked-up launch ran) -- never "expired".
    expect(db.getCommittedRequest(row.request_id)?.state).not.toBe('expired')
  })

  it('expires a "launch_requested" row once its launch-approval code window has passed', async () => {
    const db = new FakeDb()
    const row = db.seedRow({
      state: 'launch_requested',
      launch_requested_at: new Date(Date.now() - 20 * 60_000),
    })
    const { buildOrchestrator, launchOrchestrator } = fakeOrchestrators()

    await runOneTick({
      pool: db as unknown as pg.Pool,
      buildOrchestrator: buildOrchestrator as never,
      launchOrchestrator: launchOrchestrator as never,
      approvalCodeTtlMinutes: 15,
      pollIntervalMs: 10,
    })

    expect(db.getCommittedRequest(row.request_id)?.state).toBe('expired')
  })
})
