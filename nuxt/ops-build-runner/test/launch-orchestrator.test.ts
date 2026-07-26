import type Docker from 'dockerode'
import type pg from 'pg'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLaunchOrchestrator } from '../src/orchestrator/launch-orchestrator.ts'
import { FakeDb } from './helpers/fake-db.ts'

describe('LaunchOrchestrator', () => {
  let db: FakeDb

  beforeEach(() => {
    db = new FakeDb()
  })

  it('launches THIS request\'s own image_local_tag, never any other image, and sets a mandatory TTL', async () => {
    const row = db.seedRow({ state: 'launch_approved', image_local_tag: 'ops-build/ops-dashboard:sha-req1' })

    const container = { id: 'container-123', start: vi.fn(async () => undefined) }
    const createContainer = vi.fn(async () => container)
    const docker = { createContainer } as unknown as Docker

    const orchestrator = createLaunchOrchestrator({
      pool: db as unknown as pg.Pool,
      docker,
      launchTtlMinutes: 30,
    })

    const before = Date.now()
    await orchestrator.runLaunch(row.request_id)
    const after = Date.now()

    expect(createContainer).toHaveBeenCalledWith(
      expect.objectContaining({ Image: 'ops-build/ops-dashboard:sha-req1' }),
    )
    expect(container.start).toHaveBeenCalledTimes(1)

    const updated = db.getCommittedRequest(row.request_id)
    expect(updated?.state).toBe('launched')
    expect(updated?.launch_container_id).toBe('container-123')
    expect(updated?.ttl_expires_at).toBeInstanceOf(Date)
    const ttlMs = updated!.ttl_expires_at!.getTime()
    // Mandatory TTL is always set, ~30 minutes out -- never left null/skippable.
    expect(ttlMs).toBeGreaterThanOrEqual(before + 30 * 60_000 - 1000)
    expect(ttlMs).toBeLessThanOrEqual(after + 30 * 60_000 + 1000)
  })

  it('transitions to launch_failed (never launched) if docker run fails, and never records a container id', async () => {
    const row = db.seedRow({ state: 'launch_approved', image_local_tag: 'ops-build/ops-dashboard:sha-req2' })

    const docker = {
      createContainer: vi.fn(async () => {
        throw new Error('daemon unreachable')
      }),
    } as unknown as Docker

    const orchestrator = createLaunchOrchestrator({ pool: db as unknown as pg.Pool, docker, launchTtlMinutes: 30 })
    await orchestrator.runLaunch(row.request_id)

    const updated = db.getCommittedRequest(row.request_id)
    expect(updated?.state).toBe('launch_failed')
    expect(updated?.launch_container_id).toBeNull()

    const finishEvent = db.auditLog.find((e) => e.event === 'build_request.launch_finish')
    expect(finishEvent?.outcome).toBe('error')
  })

  it('refuses to launch a request with no recorded image_local_tag rather than accepting any other image', async () => {
    const row = db.seedRow({ state: 'launch_approved', image_local_tag: null })
    const createContainer = vi.fn()
    const docker = { createContainer } as unknown as Docker

    const orchestrator = createLaunchOrchestrator({ pool: db as unknown as pg.Pool, docker, launchTtlMinutes: 30 })
    await orchestrator.runLaunch(row.request_id)

    expect(createContainer).not.toHaveBeenCalled()
    expect(db.getCommittedRequest(row.request_id)?.state).toBe('launch_failed')
  })

  it('tearDown stops and removes the container, then transitions launched -> torn_down, audited as ttl-expired', async () => {
    const row = db.seedRow({
      state: 'launched',
      launch_container_id: 'container-xyz',
      ttl_expires_at: new Date(Date.now() - 1000),
    })

    const stop = vi.fn(async () => undefined)
    const remove = vi.fn(async () => undefined)
    const docker = { getContainer: vi.fn(() => ({ stop, remove })) } as unknown as Docker

    const orchestrator = createLaunchOrchestrator({ pool: db as unknown as pg.Pool, docker, launchTtlMinutes: 30 })
    await orchestrator.tearDown(row.request_id)

    expect(stop).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(db.getCommittedRequest(row.request_id)?.state).toBe('torn_down')

    const teardownEvent = db.auditLog.find((e) => e.event === 'build_request.teardown')
    expect(teardownEvent?.outcome).toBe('success')
    expect((teardownEvent?.detail as { reason?: string } | null)?.reason).toBe('ttl-expired')
  })

  it('tearDown is a no-op for a request that is not actually launched', async () => {
    const row = db.seedRow({ state: 'built' })
    const getContainer = vi.fn()
    const docker = { getContainer } as unknown as Docker

    const orchestrator = createLaunchOrchestrator({ pool: db as unknown as pg.Pool, docker, launchTtlMinutes: 30 })
    await orchestrator.tearDown(row.request_id)

    expect(getContainer).not.toHaveBeenCalled()
    expect(db.getCommittedRequest(row.request_id)?.state).toBe('built')
  })
})
