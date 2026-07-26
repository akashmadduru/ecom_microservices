import { execFile as execFileCb } from 'node:child_process'
import { existsSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const execFile = promisify(execFileCb)

/**
 * A generous but bounded buffer for git's stdout/stderr (clone/fetch progress
 * output on a monorepo this size can exceed Node's 1MB execFile default).
 */
const MAX_BUFFER_BYTES = 32 * 1024 * 1024

/**
 * Defense in depth, on top of `execFile`'s own argument-array (no shell)
 * discipline: `gitRef` is user-supplied input (the `POST /build-requests`
 * body), so it is validated against git's own ref-naming shape BEFORE it is
 * ever passed to a subprocess -- specifically rejecting a leading `-`, which
 * `execFile` alone does not stop from being interpreted as a flag by git
 * itself once it reaches argv (e.g. a gitRef of "--upload-pack=/bin/sh" would
 * still be a single, non-shell-interpreted argv entry, but git itself would
 * happily parse it as an option). ".." is rejected because git's own
 * `check-ref-format` forbids two consecutive dots in a ref name -- this is
 * not an arbitrary extra restriction, it mirrors git's own rules.
 */
const SAFE_REF_PATTERN = /^[A-Za-z0-9._/-]{1,200}$/

function assertSafeRef(ref: string): void {
  if (!SAFE_REF_PATTERN.test(ref) || ref.startsWith('-') || ref.includes('..')) {
    throw new Error(
      `Refusing to use "${ref}" as a git ref/sha: it does not match the allowed shape ` +
        `(alphanumerics, ".", "_", "-", "/" only; must not start with "-" or contain "..").`,
    )
  }
}

export interface GitCheckoutManagerOptions {
  /** The monorepo's own git remote. No default -- see config.ts. */
  remoteUrl: string | undefined
  /** Where the ONE persistent, scoped mirror clone lives. */
  mirrorDir: string
  /** Root directory under which a fresh, ephemeral worktree is created per build. */
  scratchRootDir: string
}

/**
 * Maintains ONE scoped local clone of the monorepo (via `remoteUrl`), refreshed
 * with a real `git fetch` before every ancestor check -- this service never
 * trusts a stale cached state (an explicit edge case called out by the
 * approved architecture). Every build gets its own fresh `git worktree`
 * checked out from this one clone: worktrees share the clone's object store
 * (no full re-clone per build) but each has its own independent working
 * directory and index, so two concurrent build requests can never race on a
 * shared, mutable checkout.
 *
 * This is a REGULAR clone (not `--mirror`/bare), specifically so `origin/main`
 * exists as an ordinary remote-tracking ref that `git merge-base
 * --is-ancestor <sha> origin/main` can resolve directly -- a `--mirror` clone
 * would instead mirror `refs/heads/main` verbatim with no `refs/remotes/
 * origin/*` namespace at all, which would break that exact check.
 *
 * Every git invocation uses `execFile` with an argument array -- never `exec`
 * with a concatenated string -- so no git ref or path is ever interpreted by
 * a shell. `gitRef`/`sha` are additionally validated against git's own ref-
 * naming shape before use (see `assertSafeRef`), since they originate from
 * request input.
 */
export class GitCheckoutManager {
  private readonly worktreeRootsByContextDir = new Map<string, string>()

  constructor(private readonly opts: GitCheckoutManagerOptions) {}

  private async run(args: string[], cwd: string): Promise<string> {
    const { stdout } = await execFile('git', args, { cwd, maxBuffer: MAX_BUFFER_BYTES })
    return stdout
  }

  private async ensureCloned(): Promise<void> {
    const gitDir = path.join(this.opts.mirrorDir, '.git')
    if (existsSync(gitDir)) return

    if (!this.opts.remoteUrl) {
      throw new Error(
        'GIT_REMOTE_URL is not configured; cannot create the monorepo checkout GitAncestorGuard depends on.',
      )
    }
    await fs.mkdir(path.dirname(this.opts.mirrorDir), { recursive: true })
    await execFile('git', ['clone', '--origin', 'origin', this.opts.remoteUrl, this.opts.mirrorDir], {
      maxBuffer: MAX_BUFFER_BYTES,
    })
  }

  /**
   * Ensures the persistent clone exists, then fetches fresh state from
   * `origin`. MUST be called before every ancestor check -- never rely on
   * whatever state happened to be on disk from a previous request.
   */
  async fetchLatest(): Promise<void> {
    if (!this.opts.remoteUrl) {
      throw new Error(
        'GIT_REMOTE_URL is not configured; cannot fetch the monorepo checkout GitAncestorGuard depends on.',
      )
    }
    await this.ensureCloned()
    // Defensive: keep the clone's remote pointed at the configured URL even
    // if this directory happened to persist across a config change.
    await this.run(['remote', 'set-url', 'origin', this.opts.remoteUrl], this.opts.mirrorDir)
    await this.run(['fetch', '--prune', '--tags', 'origin'], this.opts.mirrorDir)
  }

  /**
   * Resolves `gitRef` (a branch name, tag, or full/short sha) to a full commit
   * sha, or `null` if it cannot be resolved at all -- tried in order as a
   * remote-tracking branch, then a tag, then as a raw ref/sha (covers a
   * caller passing an already-fully-qualified ref or a bare sha directly).
   */
  async resolveRef(gitRef: string): Promise<string | null> {
    assertSafeRef(gitRef)
    const candidates = [`refs/remotes/origin/${gitRef}`, `refs/tags/${gitRef}`, gitRef]

    for (const candidate of candidates) {
      try {
        const stdout = await this.run(
          ['rev-parse', '--verify', `${candidate}^{commit}`],
          this.opts.mirrorDir,
        )
        const sha = stdout.trim()
        if (sha) return sha
      } catch {
        // Not resolvable via this candidate form -- try the next one. A
        // non-zero exit here just means "not this shape", not an error.
      }
    }
    return null
  }

  /**
   * `git merge-base --is-ancestor <sha> origin/main`, checking the actual
   * exit code: 0 means ancestor (true), 1 means not (false), anything else is
   * a real error (thrown), never silently treated as "not an ancestor".
   */
  async isAncestorOfMain(sha: string): Promise<boolean> {
    assertSafeRef(sha)
    try {
      await this.run(['merge-base', '--is-ancestor', sha, 'origin/main'], this.opts.mirrorDir)
      return true
    } catch (err) {
      const code = (err as NodeJS.ErrnoException & { code?: number }).code
      if (code === 1) return false
      throw new Error(
        `git merge-base --is-ancestor exited unexpectedly (${String(code)}) for sha "${sha}": ` +
          `${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * Checks out `sha` into a fresh, ephemeral `git worktree` (never a shared
   * mutable working directory two concurrent builds could race on), and
   * returns the absolute path to actually build from -- the worktree root
   * itself for `buildContext: '.'`, or `<worktree>/<buildContext>` otherwise.
   */
  async prepareBuildContext(sha: string, buildContext: string): Promise<string> {
    assertSafeRef(sha)

    await fs.mkdir(this.opts.scratchRootDir, { recursive: true })
    // mkdtemp reserves a guaranteed-unique directory name; it is removed
    // immediately after so `git worktree add` (which wants to create the
    // target itself) can use that exact path -- a normal idiom for getting a
    // unique path without a real TOCTOU exposure in this single-process,
    // human-approval-gated workflow.
    const reserved = await fs.mkdtemp(path.join(this.opts.scratchRootDir, 'build-'))
    await fs.rm(reserved, { recursive: true, force: true })

    await this.run(['worktree', 'add', '--detach', reserved, sha], this.opts.mirrorDir)

    const contextDir = buildContext === '.' ? reserved : path.join(reserved, buildContext)
    // Tracked so cleanupBuildContext (given the CONTEXT dir the caller has,
    // which may be a subdirectory of the worktree root) knows the actual
    // worktree root `git worktree remove` needs.
    this.worktreeRootsByContextDir.set(contextDir, reserved)
    return contextDir
  }

  /**
   * Removes the worktree created by `prepareBuildContext` for this same
   * `contextDir`. Best-effort: a failure here leaks disk (a real but minor
   * operational concern), it is never treated as a reason to fail an
   * otherwise-successful build, so failures are logged, not thrown.
   */
  async cleanupBuildContext(contextDir: string): Promise<void> {
    const worktreeRoot = this.worktreeRootsByContextDir.get(contextDir) ?? contextDir
    this.worktreeRootsByContextDir.delete(contextDir)
    try {
      await this.run(['worktree', 'remove', '--force', worktreeRoot], this.opts.mirrorDir)
    } catch (err) {
      console.error(
        JSON.stringify({
          event: 'ops-build-runner.git-checkout.cleanup-failed',
          ts: new Date().toISOString(),
          worktreeRoot,
          error: err instanceof Error ? err.message : String(err),
        }),
      )
    }
  }
}
