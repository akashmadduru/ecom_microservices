import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import type Docker from 'dockerode'
import type pg from 'pg'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBuildOrchestrator } from '../src/orchestrator/build-orchestrator.ts'
import { FakeDb } from './helpers/fake-db.ts'

/** A build-stream fixture: one newline-delimited-JSON event per line, exactly the real Docker build API's wire format. */
function buildStream(events: unknown[]): NodeJS.ReadableStream {
  return Readable.from(events.map((e) => JSON.stringify(e) + '\n'))
}

function makeFakeGitCheckout(contextDir: string) {
  return {
    fetchLatest: vi.fn(async () => undefined),
    resolveRef: vi.fn(async () => null),
    isAncestorOfMain: vi.fn(async () => true),
    prepareBuildContext: vi.fn(async () => contextDir),
    cleanupBuildContext: vi.fn(async () => undefined),
  }
}

describe('BuildOrchestrator', () => {
  let db: FakeDb
  let logDir: string
  let contextDir: string

  beforeEach(async () => {
    db = new FakeDb()
    logDir = await mkdtemp(path.join(os.tmpdir(), 'ops-build-runner-logs-'))
    contextDir = await mkdtemp(path.join(os.tmpdir(), 'ops-build-runner-context-'))
  })

  afterEach(async () => {
    await rm(logDir, { recursive: true, force: true })
    await rm(contextDir, { recursive: true, force: true })
  })

  it('runs a successful build: approved -> building -> built, with image tag/digest/log recorded', async () => {
    const row = db.seedRow({ state: 'approved', target: 'ops-dashboard', resolved_sha: 'f'.repeat(40) })
    const gitCheckout = makeFakeGitCheckout(contextDir)

    const docker = {
      buildImage: vi.fn(async () => buildStream([{ stream: 'Step 1/1 : FROM scratch\n' }])),
      getImage: vi.fn(() => ({ inspect: async () => ({ Id: 'sha256:deadbeef' }) })),
    } as unknown as Docker

    const orchestrator = createBuildOrchestrator({
      pool: db as unknown as pg.Pool,
      gitCheckout: gitCheckout as never,
      docker,
      buildLogDir: logDir,
    })

    await orchestrator.runBuild(row.request_id)

    const updated = db.getCommittedRequest(row.request_id)
    expect(updated?.state).toBe('built')
    expect(updated?.image_local_tag).toBe(`ops-build/ops-dashboard:${row.resolved_sha}-${row.request_id}`)
    expect(updated?.image_digest).toBe('sha256:deadbeef')
    expect(updated?.build_exit_code).toBe(0)
    expect(updated?.build_log_ref).toBeTruthy()

    const logContents = await readFile(updated!.build_log_ref!, 'utf8')
    expect(logContents).toContain('FROM scratch')

    // Worktree is cleaned up exactly once, using the same contextDir it was handed.
    expect(gitCheckout.cleanupBuildContext).toHaveBeenCalledWith(contextDir)

    const startEvent = db.auditLog.find((e) => e.event === 'build_request.build_start')
    const finishEvent = db.auditLog.find((e) => e.event === 'build_request.build_finish')
    expect(startEvent?.outcome).toBe('attempt')
    expect(finishEvent?.outcome).toBe('success')
  })

  it('records a build failure (an "error" event in the stream) as building -> build_failed, never built', async () => {
    const row = db.seedRow({ state: 'approved', resolved_sha: 'f'.repeat(40) })
    const gitCheckout = makeFakeGitCheckout(contextDir)

    const docker = {
      buildImage: vi.fn(async () =>
        buildStream([{ stream: 'Step 1/2 : FROM node:24\n' }, { error: 'exit code 1: npm ci failed' }]),
      ),
      getImage: vi.fn(() => ({ inspect: async () => ({ Id: 'sha256:should-not-be-used' }) })),
    } as unknown as Docker

    const orchestrator = createBuildOrchestrator({
      pool: db as unknown as pg.Pool,
      gitCheckout: gitCheckout as never,
      docker,
      buildLogDir: logDir,
    })

    await orchestrator.runBuild(row.request_id)

    const updated = db.getCommittedRequest(row.request_id)
    expect(updated?.state).toBe('build_failed')
    expect(updated?.image_local_tag).toBeNull()
    expect(updated?.build_exit_code).toBe(1)

    const finishEvent = db.auditLog.find((e) => e.event === 'build_request.build_finish')
    expect(finishEvent?.outcome).toBe('error')

    expect(gitCheckout.cleanupBuildContext).toHaveBeenCalledWith(contextDir)
  })

  it('treats a missing resolved_sha as a build failure rather than throwing/crashing the worker', async () => {
    const row = db.seedRow({ state: 'approved', resolved_sha: null })
    const gitCheckout = makeFakeGitCheckout(contextDir)
    const docker = { buildImage: vi.fn(), getImage: vi.fn() } as unknown as Docker

    const orchestrator = createBuildOrchestrator({
      pool: db as unknown as pg.Pool,
      gitCheckout: gitCheckout as never,
      docker,
      buildLogDir: logDir,
    })

    await orchestrator.runBuild(row.request_id)

    expect(db.getCommittedRequest(row.request_id)?.state).toBe('build_failed')
    expect(docker.buildImage).not.toHaveBeenCalled()
  })
})
