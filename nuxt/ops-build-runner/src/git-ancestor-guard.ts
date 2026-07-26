/**
 * `GitAncestorGuard` is the security gate that is supposed to answer "is this
 * `gitRef` actually an ancestor of the monorepo's `main` branch, on a real,
 * scoped checkout this service controls" -- i.e. it is what stops a build
 * request from ever building an attacker-controlled ref.
 *
 * PHASE 2: `RealGitAncestorGuard` (below) is the real implementation, wired
 * into production by src/index.ts. It delegates to `GitCheckoutManager`
 * (src/git-checkout.ts): fetch fresh state, resolve `gitRef` to a sha, then
 * verify that sha is an ancestor of `origin/main` -- via
 * `git merge-base --is-ancestor`, checking the actual exit code, never a
 * silent default.
 *
 * `NotImplementedGitAncestorGuard` (Phase 1's placeholder) is kept in this
 * file rather than deleted: it is a genuinely safe fallback (it always
 * rejects, never accepts) and costs nothing to keep available, but it is no
 * longer wired into src/index.ts's production path -- `RealGitAncestorGuard`
 * is. A future reviewer must not mistake either implementation for the other:
 * the class name is the whole story in each case.
 */

import type { GitCheckoutManager } from './git-checkout.js'

export interface GitAncestorVerification {
  ok: boolean
  /** The commit SHA `gitRef` resolved to, once a real implementation exists. */
  resolvedSha?: string
  /** Human-readable reason, always populated when `ok` is false. */
  reason: string
}

export interface GitAncestorGuard {
  verifyAncestor(gitRef: string): Promise<GitAncestorVerification>
}

/**
 * Phase 1 placeholder. Always rejects. TODO(Phase 2): replace with a real
 * implementation that clones/fetches a scoped checkout against
 * `GIT_REMOTE_URL` and verifies `gitRef` is an ancestor of `main` (e.g. `git
 * merge-base --is-ancestor`), returning the resolved SHA on success.
 */
export class NotImplementedGitAncestorGuard implements GitAncestorGuard {
  async verifyAncestor(_gitRef: string): Promise<GitAncestorVerification> {
    return Promise.resolve({
      ok: false,
      reason:
        'GitAncestorGuard is not implemented yet (Phase 1 scaffolding only). ' +
        'No gitRef can be verified as an ancestor of main, so every build ' +
        'request is rejected at this step until Phase 2 implements the real check.',
    })
  }
}

/**
 * The real implementation. Validation order per step (4) of the approved
 * contract: (a) refresh state (`fetchLatest` -- never trust a stale cache);
 * (b) resolve `gitRef` to a sha, 400/reject with a specific reason if it
 * cannot be resolved at all; (c) verify that sha is an ancestor of `main`,
 * 400/reject with a specific reason ("not an ancestor of main") if not.
 * Returns the resolved sha on success so the caller can persist it to
 * `resolved_sha`. Infrastructure-level failures (e.g. `GIT_REMOTE_URL`
 * misconfigured, the remote unreachable, a real git error) are deliberately
 * NOT swallowed into a `{ ok: false }` result here -- they propagate as
 * thrown errors, distinct from "this specific gitRef is invalid", exactly
 * like every other unanticipated failure in this service (see
 * src/http/server.ts's catch-all).
 */
export class RealGitAncestorGuard implements GitAncestorGuard {
  constructor(private readonly checkout: GitCheckoutManager) {}

  async verifyAncestor(gitRef: string): Promise<GitAncestorVerification> {
    await this.checkout.fetchLatest()

    const sha = await this.checkout.resolveRef(gitRef)
    if (!sha) {
      return {
        ok: false,
        reason: `"${gitRef}" could not be resolved to a commit on the monorepo's remote (checked after a fresh git fetch).`,
      }
    }

    const isAncestor = await this.checkout.isAncestorOfMain(sha)
    if (!isAncestor) {
      return {
        ok: false,
        reason: `"${gitRef}" (resolved to ${sha}) is not an ancestor of main.`,
      }
    }

    return { ok: true, resolvedSha: sha, reason: 'ancestor of main' }
  }
}
