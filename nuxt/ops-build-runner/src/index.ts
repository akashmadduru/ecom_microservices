import Docker from 'dockerode'
import { getConfig } from './config.js'
import { closePool, getPool } from './db.js'
import { GitCheckoutManager } from './git-checkout.js'
import { RealGitAncestorGuard } from './git-ancestor-guard.js'
import { createHttpServer } from './http/server.js'
import { createRoutes } from './http/routes.js'
import { createLazyApprovalNotifier } from './notifier/factory.js'
import { createBuildOrchestrator } from './orchestrator/build-orchestrator.js'
import { createLaunchOrchestrator } from './orchestrator/launch-orchestrator.js'
import { createBuildRequestService } from './service/build-request-service.js'
import { startWorker, type Worker } from './worker.js'

/**
 * Process entrypoint. `BUILD_RUNNER_TOKEN` and `SLACK_WEBHOOK_URL` (when
 * `APPROVAL_NOTIFIER` is "slack", the required default) are deliberately NOT
 * validated here to decide whether to boot at all -- both fail closed
 * per-request instead (503), exactly mirroring nuxt/ops-dashboard's own
 * `OPS_API_TOKEN` convention. `DATABASE_URL` and (Phase 2) `GIT_REMOTE_URL`
 * ARE required to boot: there is no meaningful degraded mode for a service
 * whose entire job is reading/writing one Postgres table and, now,
 * building/launching real containers against a real git checkout of the
 * monorepo it is itself part of.
 *
 * `RealGitAncestorGuard` is the only `GitAncestorGuard` wired in production --
 * unlike `APPROVAL_NOTIFIER`, there is no env-flag bypass to a permissive
 * stub here. `GitCheckoutManager`'s tests inject fakes directly; there is no
 * operational need for an "accept everything" local-dev mode for a check
 * whose entire job is rejecting non-ancestor refs, and adding one would be
 * exactly the kind of silent-permissive-default footgun this platform's
 * `APPROVAL_NOTIFIER` precedent was designed to avoid, not repeat.
 */
function main(): void {
  const config = getConfig()

  if (!config.databaseUrl) {
    console.error('DATABASE_URL is not configured; refusing to start.')
    process.exit(1)
  }
  if (!config.gitRemoteUrl) {
    console.error('GIT_REMOTE_URL is not configured; refusing to start.')
    process.exit(1)
  }

  const pool = getPool()
  const notifier = createLazyApprovalNotifier(getConfig)

  const gitCheckout = new GitCheckoutManager({
    remoteUrl: config.gitRemoteUrl,
    mirrorDir: config.gitMirrorDir,
    scratchRootDir: config.gitScratchRootDir,
  })
  const gitAncestorGuard = new RealGitAncestorGuard(gitCheckout)

  // Pointed at the ISOLATED build-daemon (rootless DinD, its own compose
  // network -- see docker-compose.yml) -- NEVER this repo's own host daemon,
  // and NEVER nuxt/ops-dashboard's docker-socket-proxies. One client for both
  // build and launch: both actions target the same single isolated daemon,
  // and builds/launches are already serialized by src/worker.ts, so (unlike
  // ops-dashboard's three separately-scoped proxies) there is only one trust
  // boundary here to keep a client scoped to.
  const buildDaemonDocker = new Docker({ host: config.buildDaemonHost, port: config.buildDaemonPort })

  const service = createBuildRequestService({
    pool,
    notifier,
    gitAncestorGuard,
    config,
  })

  const buildOrchestrator = createBuildOrchestrator({
    pool,
    gitCheckout,
    docker: buildDaemonDocker,
    buildLogDir: config.buildLogDir,
  })
  const launchOrchestrator = createLaunchOrchestrator({
    pool,
    docker: buildDaemonDocker,
    launchTtlMinutes: config.launchTtlMinutes,
  })

  const worker: Worker = startWorker({
    pool,
    buildOrchestrator,
    launchOrchestrator,
    approvalCodeTtlMinutes: config.approvalCodeTtlMinutes,
    pollIntervalMs: config.workerPollIntervalSeconds * 1000,
  })

  const router = createRoutes(service, pool)
  const server = createHttpServer(router, () => getConfig().buildRunnerToken)

  server.listen(config.port, () => {
    console.log(
      JSON.stringify({
        event: 'ops-build-runner.listening',
        ts: new Date().toISOString(),
        port: config.port,
        approvalNotifierMode: config.approvalNotifierMode,
      }),
    )
  })

  const shutdown = (signal: string): void => {
    console.log(JSON.stringify({ event: 'ops-build-runner.shutdown', signal }))
    worker.stop()
    server.close(() => {
      void closePool().finally(() => process.exit(0))
    })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

main()
