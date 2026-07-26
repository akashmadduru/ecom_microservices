import type pg from 'pg'
import { issueApprovalCode, verifyApprovalCode } from '../approval-code.js'
import { writeAudit } from '../audit.js'
import type { OpsBuildRunnerConfig } from '../config.js'
import {
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '../errors.js'
import type { GitAncestorGuard } from '../git-ancestor-guard.js'
import type { ApprovalNotifier } from '../notifier/types.js'
import {
  findBuildRequestById,
  insertBuildRequest,
  markApproved,
  markLaunchApproved,
  markLaunchRequested,
  setState,
} from '../repository/build-requests-repository.js'
import { toPublicBuildRequest, type PublicBuildRequest } from '../repository/public-shape.js'
import { withLockedBuildRequest } from '../repository/with-locked-request.js'
import { assertTransitionAllowed, type BuildRequestState } from '../state-machine.js'
import { isBuildTarget } from '../targets.js'

export interface CreateBuildRequestInput {
  target: string
  gitRef: string
  reason: string
  requesterSignal: string
}

export interface BuildRequestServiceDeps {
  pool: pg.Pool
  notifier: ApprovalNotifier
  gitAncestorGuard: GitAncestorGuard
  config: Pick<OpsBuildRunnerConfig, 'approvalCodeTtlMinutes'>
}

/**
 * Factory over an injectable `pool`/`notifier`/`gitAncestorGuard`/`config` so
 * unit tests can exercise the full validation-ordering and state-machine
 * behavior against fakes, without a real Postgres instance or a real Slack
 * webhook. Production wiring (src/index.ts) supplies the real pool, the
 * configured notifier, and (deliberately, for now) the always-rejecting
 * `NotImplementedGitAncestorGuard`.
 */
export function createBuildRequestService(deps: BuildRequestServiceDeps) {
  const { pool, notifier, gitAncestorGuard, config } = deps

  /**
   * Validation order, exactly as specified: (1) auth is enforced by the HTTP
   * layer before this is ever called; (2) target allowlist; (3) non-empty
   * gitRef; (4) GitAncestorGuard.verifyAncestor; (5) create the row + issue +
   * store the approval code + notify. Steps (2)-(4) never touch the
   * database -- only step (5) does.
   */
  async function createBuildRequest(
    input: CreateBuildRequestInput,
  ): Promise<{ requestId: string; state: string }> {
    const { target, gitRef, reason, requesterSignal } = input

    // (2) target allowlist.
    if (!isBuildTarget(target)) {
      throw new ValidationError(
        `"target" must be one of the allowlisted build targets; received "${target}".`,
      )
    }

    // (3) gitRef non-empty.
    if (!gitRef || gitRef.trim().length === 0) {
      throw new ValidationError('"gitRef" must be a non-empty string.')
    }

    if (!reason || reason.trim().length === 0) {
      throw new ValidationError('"reason" must be a non-empty string.')
    }

    // (4) GitAncestorGuard. Phase 1 ships NotImplementedGitAncestorGuard,
    // which always rejects -- see git-ancestor-guard.ts's doc comment. This is
    // not a bug; every build request will fail here until Phase 2 replaces it.
    const verification = await gitAncestorGuard.verifyAncestor(gitRef)
    if (!verification.ok) {
      throw new ValidationError(`gitRef could not be verified: ${verification.reason}`)
    }

    // (5) Create the row, issue + hash + store the approval code, and notify.
    // The INSERT and the notifier call share ONE transaction, held open
    // across the (awaited) notifier call: if the notifier throws (e.g. the
    // Slack webhook is unreachable), the whole transaction is rolled back so
    // NO row is ever left behind in "requested" state with an approval code
    // nobody was ever told -- fail closed, never silently succeed with an
    // unreachable approval path. The tradeoff (a DB transaction held open for
    // the duration of one outbound HTTP call) is accepted deliberately for
    // this low-throughput, human-approval-gated workflow -- see
    // docs/apps/ops-build-runner/DecisionLog.md.
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      const { plaintext, hash } = issueApprovalCode()
      const row = await insertBuildRequest(client, {
        target,
        gitRef,
        resolvedSha: verification.resolvedSha ?? null,
        reason,
        requesterSignal,
        approvalCodeHash: hash,
      })

      await writeAudit(client, {
        requestId: row.request_id,
        event: 'build_request.created',
        outcome: 'attempt',
        actorSignal: requesterSignal,
        detail: { target, gitRef },
      })

      try {
        await notifier.sendApprovalCode(row.request_id, plaintext, { target, gitRef, reason })
      } catch (err) {
        // Audit the failure to stdout only -- writeAudit's durable half would
        // itself be rolled back along with everything else in this
        // transaction, since the row it references is about to stop existing.
        console.error(
          JSON.stringify({
            event: 'ops-build-runner.audit',
            ts: new Date().toISOString(),
            requestId: row.request_id,
            auditEvent: 'build_request.created',
            outcome: 'error',
            actorSignal: requesterSignal,
            detail: {
              reason: 'approval notifier failed; rolling back the entire request',
              error: err instanceof Error ? err.message : String(err),
            },
          }),
        )
        await client.query('ROLLBACK')
        throw new ServiceUnavailableError(
          'Could not deliver the approval code (approval notifier failed). ' +
            'No build request was created -- retry once the notifier is reachable.',
        )
      }

      await writeAudit(client, {
        requestId: row.request_id,
        event: 'build_request.created',
        outcome: 'success',
        actorSignal: requesterSignal,
        detail: { target, gitRef },
      })

      await client.query('COMMIT')
      return { requestId: row.request_id, state: row.state }
    } catch (err) {
      // Belt-and-braces: if anything above threw without an explicit
      // ROLLBACK (e.g. a DB error from insertBuildRequest itself), make sure
      // the transaction never lingers open on this connection.
      await client.query('ROLLBACK').catch(() => undefined)
      throw err
    } finally {
      client.release()
    }
  }

  async function getBuildRequest(requestId: string): Promise<PublicBuildRequest> {
    const row = await findBuildRequestById(pool, requestId)
    if (!row) throw new NotFoundError(`No build request with id "${requestId}".`)
    return toPublicBuildRequest(row)
  }

  async function approveBuildRequest(
    requestId: string,
    approvalCode: string,
    approverSignal: string,
  ): Promise<{ state: string }> {
    return withLockedBuildRequest(pool, requestId, async (client, row) => {
      assertTransitionAllowed(asState(row.state), 'approved')

      const valid = verifyApprovalCode({
        presented: approvalCode,
        storedHash: row.approval_code_hash,
        issuedAt: row.created_at,
        ttlMinutes: config.approvalCodeTtlMinutes,
      })

      if (!valid) {
        await writeAudit(client, {
          requestId,
          event: 'build_request.approve',
          outcome: 'denied',
          actorSignal: approverSignal,
          detail: { reason: 'invalid or expired approval code' },
        })
        throw new ForbiddenError('Invalid or expired approval code.')
      }

      const updated = await markApproved(client, { requestId, newState: 'approved', approverSignal })
      await writeAudit(client, {
        requestId,
        event: 'build_request.approve',
        outcome: 'success',
        actorSignal: approverSignal,
      })
      return { state: updated.state }
    })
  }

  async function requestLaunch(requestId: string): Promise<{ state: string }> {
    return withLockedBuildRequest(pool, requestId, async (client, row) => {
      assertTransitionAllowed(asState(row.state), 'launch_requested')

      const { plaintext, hash } = issueApprovalCode()
      const updated = await markLaunchRequested(client, {
        requestId,
        newState: 'launch_requested',
        launchApprovalCodeHash: hash,
      })

      await writeAudit(client, {
        requestId,
        event: 'build_request.launch_request',
        outcome: 'attempt',
        actorSignal: null,
        detail: { target: row.target, gitRef: row.git_ref },
      })

      try {
        await notifier.sendApprovalCode(requestId, plaintext, {
          target: row.target,
          gitRef: row.git_ref,
          reason: row.reason,
        })
      } catch (err) {
        console.error(
          JSON.stringify({
            event: 'ops-build-runner.audit',
            ts: new Date().toISOString(),
            requestId,
            auditEvent: 'build_request.launch_request',
            outcome: 'error',
            detail: {
              reason: 'approval notifier failed; rolling back the launch request',
              error: err instanceof Error ? err.message : String(err),
            },
          }),
        )
        throw new ServiceUnavailableError(
          'Could not deliver the launch-approval code (approval notifier failed). ' +
            'The request remains in its previous state -- retry once the notifier is reachable.',
        )
      }

      await writeAudit(client, {
        requestId,
        event: 'build_request.launch_request',
        outcome: 'success',
        actorSignal: null,
      })

      return { state: updated.state }
    })
  }

  async function approveLaunch(
    requestId: string,
    approvalCode: string,
    approverSignal: string,
  ): Promise<{ state: string }> {
    return withLockedBuildRequest(pool, requestId, async (client, row) => {
      assertTransitionAllowed(asState(row.state), 'launch_approved')

      const valid = verifyApprovalCode({
        presented: approvalCode,
        storedHash: row.launch_approval_code_hash,
        issuedAt: row.launch_requested_at,
        ttlMinutes: config.approvalCodeTtlMinutes,
      })

      if (!valid) {
        await writeAudit(client, {
          requestId,
          event: 'build_request.launch_approve',
          outcome: 'denied',
          actorSignal: approverSignal,
          detail: { reason: 'invalid or expired launch approval code' },
        })
        throw new ForbiddenError('Invalid or expired launch approval code.')
      }

      const updated = await markLaunchApproved(client, {
        requestId,
        newState: 'launch_approved',
        launchApproverSignal: approverSignal,
      })
      await writeAudit(client, {
        requestId,
        event: 'build_request.launch_approve',
        outcome: 'success',
        actorSignal: approverSignal,
      })
      return { state: updated.state }
    })
  }

  async function cancelBuildRequest(requestId: string): Promise<{ state: string }> {
    return withLockedBuildRequest(pool, requestId, async (client, row) => {
      assertTransitionAllowed(asState(row.state), 'cancelled')
      const updated = await setState(client, requestId, 'cancelled')
      await writeAudit(client, {
        requestId,
        event: 'build_request.cancel',
        outcome: 'success',
        actorSignal: null,
      })
      return { state: updated.state }
    })
  }

  return {
    createBuildRequest,
    getBuildRequest,
    approveBuildRequest,
    requestLaunch,
    approveLaunch,
    cancelBuildRequest,
  }
}

function asState(state: string): BuildRequestState {
  return state as BuildRequestState
}
