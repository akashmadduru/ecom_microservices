import type Docker from 'dockerode'
import type pg from 'pg'
import { writeAudit } from '../audit.js'
import {
  findBuildRequestById,
  markLaunchFailed,
  markLaunched,
  setState,
} from '../repository/build-requests-repository.js'
import { withLockedBuildRequest } from '../repository/with-locked-request.js'
import { assertTransitionAllowed, type BuildRequestState } from '../state-machine.js'

export interface LaunchOrchestratorDeps {
  pool: pg.Pool
  /** dockerode client pointed at the ISOLATED build-daemon -- never any other Docker host. */
  docker: Docker
  /** Mandatory TTL applied to every launched container. Never skippable. */
  launchTtlMinutes: number
}

/**
 * Drives one `launch_approved` build_requests row through a real `docker
 * run`, against the isolated build-daemon only, and tears launched containers
 * down once their mandatory TTL expires.
 *
 * SECURITY-CRITICAL INVARIANT: `runLaunch` only ever starts THIS SAME
 * request's own `image_local_tag` -- the exact tag BuildOrchestrator produced
 * for this request, read back off the request's own row, never a
 * caller-supplied image reference. There is no parameter anywhere in this
 * module through which a caller could ask it to launch a different image.
 */
export function createLaunchOrchestrator(deps: LaunchOrchestratorDeps) {
  const { pool, docker, launchTtlMinutes } = deps

  async function runLaunch(requestId: string): Promise<void> {
    const claimed = await withLockedBuildRequest(pool, requestId, async (client, row) => {
      assertTransitionAllowed(asState(row.state), 'launched')
      await writeAudit(client, {
        requestId,
        event: 'build_request.launch_start',
        outcome: 'attempt',
        actorSignal: null,
        detail: { target: row.target, imageLocalTag: row.image_local_tag },
      })
      return row
    })

    if (!claimed.image_local_tag) {
      // Should never happen -- launch_approved is only reachable via "built",
      // which always sets image_local_tag. Defensive, not silently swallowed.
      await finalizeLaunchFailed(requestId, 'no image_local_tag recorded on this request')
      return
    }

    try {
      const container = await docker.createContainer({
        name: `ops-build-launch-${requestId}`,
        Image: claimed.image_local_tag,
        Labels: { 'ops-build-runner.request-id': requestId },
      })
      await container.start()

      const ttlExpiresAt = new Date(Date.now() + launchTtlMinutes * 60_000)
      await withLockedBuildRequest(pool, requestId, async (client, row) => {
        assertTransitionAllowed(asState(row.state), 'launched')
        const updated = await markLaunched(client, {
          requestId,
          launchContainerId: container.id,
          ttlExpiresAt,
        })
        await writeAudit(client, {
          requestId,
          event: 'build_request.launch_finish',
          outcome: 'success',
          actorSignal: null,
          detail: { launchContainerId: container.id, ttlExpiresAt: ttlExpiresAt.toISOString() },
        })
        return updated
      })
    } catch (err) {
      await finalizeLaunchFailed(requestId, err instanceof Error ? err.message : String(err))
    }
  }

  async function finalizeLaunchFailed(requestId: string, reason: string): Promise<void> {
    await withLockedBuildRequest(pool, requestId, async (client, row) => {
      assertTransitionAllowed(asState(row.state), 'launch_failed')
      const updated = await markLaunchFailed(client, { requestId })
      await writeAudit(client, {
        requestId,
        event: 'build_request.launch_finish',
        outcome: 'error',
        actorSignal: null,
        detail: { reason },
      })
      return updated
    })
  }

  /**
   * Stops and removes a launched container, then transitions launched ->
   * torn_down. Called by src/worker.ts's TTL sweep -- never on any other
   * trigger (there is no manual "stop early" route in this phase's REST
   * contract).
   */
  async function tearDown(requestId: string): Promise<void> {
    const row = await findBuildRequestById(pool, requestId)
    if (!row || row.state !== 'launched' || !row.launch_container_id) return

    try {
      const container = docker.getContainer(row.launch_container_id)
      await container.stop({ t: 5 }).catch((err: unknown) => {
        // Already stopped/gone is fine -- proceed to remove/mark torn_down
        // regardless; anything else is logged but still not fatal to
        // teardown, since a launched container stuck forever is worse than
        // one whose stop step we couldn't fully confirm.
        console.error(
          JSON.stringify({
            event: 'ops-build-runner.launch-orchestrator.stop-failed',
            ts: new Date().toISOString(),
            requestId,
            containerId: row.launch_container_id,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      })
      await container.remove({ force: true }).catch((err: unknown) => {
        console.error(
          JSON.stringify({
            event: 'ops-build-runner.launch-orchestrator.remove-failed',
            ts: new Date().toISOString(),
            requestId,
            containerId: row.launch_container_id,
            error: err instanceof Error ? err.message : String(err),
          }),
        )
      })
    } finally {
      await withLockedBuildRequest(pool, requestId, async (client, lockedRow) => {
        assertTransitionAllowed(asState(lockedRow.state), 'torn_down')
        const updated = await setState(client, requestId, 'torn_down')
        await writeAudit(client, {
          requestId,
          event: 'build_request.teardown',
          outcome: 'success',
          actorSignal: null,
          detail: { reason: 'ttl-expired', launchContainerId: row.launch_container_id },
        })
        return updated
      })
    }
  }

  return { runLaunch, tearDown }
}

function asState(state: string): BuildRequestState {
  return state as BuildRequestState
}
