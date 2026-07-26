/**
 * Centralized, typed environment-variable access -- a single place to read
 * `process.env`, mirroring nuxt/ops-dashboard/server/runtime/config.ts's own
 * "one config module, no scattered `process.env` reads" convention.
 *
 * Every field here is read fresh on each call (no module-level caching) so
 * tests can mutate `process.env` between cases without needing a reset hook.
 */

export type ApprovalNotifierMode = 'slack' | 'console'

export interface OpsBuildRunnerConfig {
  /** Bearer token every /* route requires. Undefined => fail closed (503). */
  buildRunnerToken: string | undefined
  /** Connection string the running application uses (the narrow build_runner_app role). */
  databaseUrl: string | undefined
  /** Connection string the migration runner uses (superuser / DB owner). */
  migrationDatabaseUrl: string | undefined
  /**
   * Deliberately NOT a plain default-to-console. Only the exact string
   * "console" opts out of the safe default; unset, empty, or any other value
   * means "slack" -- an operator must make an explicit, affirmative choice to
   * downgrade to console-logged approval codes (local dev/testing only), so a
   * misconfigured deployment can never silently fall back to a mode where an
   * operator could read their own approval code out of the service's logs.
   */
  approvalNotifierMode: ApprovalNotifierMode
  /** Required if approvalNotifierMode is 'slack'. No default. */
  slackWebhookUrl: string | undefined
  /** Approval code time-to-live, in minutes. Defaults to 15 if unset/invalid. */
  approvalCodeTtlMinutes: number
  /** HTTP listen port. */
  port: number

  // -- Phase 2: orchestration -------------------------------------------
  /**
   * The monorepo's own git remote -- REQUIRED, no default (mirrors
   * DATABASE_URL's "no meaningful degraded mode" treatment: without this,
   * GitCheckoutManager cannot do anything at all, so index.ts fails closed at
   * boot rather than partially starting -- see index.ts's doc comment).
   */
  gitRemoteUrl: string | undefined
  /** Where GitCheckoutManager keeps its ONE persistent scoped mirror clone. */
  gitMirrorDir: string
  /** Root directory under which a fresh, ephemeral worktree is created per build. */
  gitScratchRootDir: string
  /** Directory each build's full log is persisted to (see build-orchestrator.ts). */
  buildLogDir: string
  /** Hostname of the isolated build-daemon (rootless DinD) -- see docker-compose.yml. */
  buildDaemonHost: string
  /** TCP port the isolated build-daemon's Docker API listens on. */
  buildDaemonPort: number
  /** Mandatory TTL applied to every launched container. Never skippable. */
  launchTtlMinutes: number
  /** How often the background worker (src/worker.ts) polls for work, in seconds. */
  workerPollIntervalSeconds: number
}

const DEFAULT_APPROVAL_CODE_TTL_MINUTES = 15
const DEFAULT_PORT = 4100
const DEFAULT_GIT_MIRROR_DIR = './var/git-mirror'
const DEFAULT_GIT_SCRATCH_ROOT_DIR = './var/git-scratch'
const DEFAULT_BUILD_LOG_DIR = './var/build-logs'
const DEFAULT_BUILD_DAEMON_HOST = 'build-daemon'
const DEFAULT_BUILD_DAEMON_PORT = 2375
const DEFAULT_LAUNCH_TTL_MINUTES = 30
const DEFAULT_WORKER_POLL_INTERVAL_SECONDS = 10

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function getConfig(): OpsBuildRunnerConfig {
  const approvalNotifierMode: ApprovalNotifierMode =
    process.env.APPROVAL_NOTIFIER === 'console' ? 'console' : 'slack'

  return {
    buildRunnerToken: process.env.BUILD_RUNNER_TOKEN || undefined,
    databaseUrl: process.env.DATABASE_URL || undefined,
    migrationDatabaseUrl: process.env.MIGRATION_DATABASE_URL || undefined,
    approvalNotifierMode,
    slackWebhookUrl: process.env.SLACK_WEBHOOK_URL || undefined,
    approvalCodeTtlMinutes: parsePositiveInt(
      process.env.APPROVAL_CODE_TTL_MINUTES,
      DEFAULT_APPROVAL_CODE_TTL_MINUTES,
    ),
    port: parsePositiveInt(process.env.PORT, DEFAULT_PORT),

    gitRemoteUrl: process.env.GIT_REMOTE_URL || undefined,
    gitMirrorDir: process.env.GIT_MIRROR_DIR || DEFAULT_GIT_MIRROR_DIR,
    gitScratchRootDir: process.env.GIT_SCRATCH_ROOT_DIR || DEFAULT_GIT_SCRATCH_ROOT_DIR,
    buildLogDir: process.env.BUILD_LOG_DIR || DEFAULT_BUILD_LOG_DIR,
    buildDaemonHost: process.env.BUILD_DAEMON_HOST || DEFAULT_BUILD_DAEMON_HOST,
    buildDaemonPort: parsePositiveInt(process.env.BUILD_DAEMON_PORT, DEFAULT_BUILD_DAEMON_PORT),
    launchTtlMinutes: parsePositiveInt(process.env.LAUNCH_TTL_MINUTES, DEFAULT_LAUNCH_TTL_MINUTES),
    workerPollIntervalSeconds: parsePositiveInt(
      process.env.WORKER_POLL_INTERVAL_SECONDS,
      DEFAULT_WORKER_POLL_INTERVAL_SECONDS,
    ),
  }
}
