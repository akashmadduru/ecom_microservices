import fs from 'node:fs/promises'
import path from 'node:path'
import type Docker from 'dockerode'
import type pg from 'pg'
import { writeAudit } from '../audit.js'
import type { GitCheckoutManager } from '../git-checkout.js'
import {
  markBuildFailed,
  markBuilding,
  markBuilt,
} from '../repository/build-requests-repository.js'
import { withLockedBuildRequest } from '../repository/with-locked-request.js'
import { assertTransitionAllowed, type BuildRequestState } from '../state-machine.js'
import { BUILD_TARGETS, dockerfileRelativeToBuildContext, type BuildTarget } from '../targets.js'

export interface BuildOrchestratorDeps {
  pool: pg.Pool
  gitCheckout: GitCheckoutManager
  /** dockerode client pointed at the ISOLATED build-daemon -- never any other Docker host. */
  docker: Docker
  buildLogDir: string
}

/**
 * Drives one `approved` build_requests row through a real `docker build`,
 * against the isolated build-daemon only. Every transition is audited
 * exactly like Phase 1's HTTP-facing actions (see audit.ts).
 *
 * Concurrency: the caller (src/worker.ts) is responsible for ensuring at most
 * one request is ever mid-build at a time (serialized builds -- see
 * worker.ts's own doc comment for why: one isolated daemon, one build at a
 * time, per the approved architecture's own scalability section). This
 * orchestrator does not itself re-check that invariant beyond the state
 * machine's own transition guard (a second concurrent caller attempting to
 * build the SAME request would simply get a 409-shaped `ConflictError` from
 * the claim step below, since the row would no longer be in `approved`).
 *
 * Never pushes the built image anywhere (no `ghcr.io` or other registry) --
 * the image stays local to the isolated daemon, per the approved architecture.
 */
export function createBuildOrchestrator(deps: BuildOrchestratorDeps) {
  const { pool, gitCheckout, docker, buildLogDir } = deps

  async function runBuild(requestId: string): Promise<void> {
    // Step 1: claim the row -- approved -> building, record the real start
    // time, audit the attempt. Short-lived transaction; the actual build
    // (which can take minutes) happens OUTSIDE it, below.
    const claimed = await withLockedBuildRequest(pool, requestId, async (client, row) => {
      assertTransitionAllowed(asState(row.state), 'building')
      const updated = await markBuilding(client, { requestId })
      await writeAudit(client, {
        requestId,
        event: 'build_request.build_start',
        outcome: 'attempt',
        actorSignal: null,
        detail: { target: row.target, gitRef: row.git_ref, resolvedSha: row.resolved_sha },
      })
      return updated
    })

    const target = claimed.target as BuildTarget
    const resolvedSha = claimed.resolved_sha
    const logPath = path.join(buildLogDir, `${requestId}.log`)

    if (!resolvedSha) {
      // Should never happen -- RealGitAncestorGuard always populates
      // resolved_sha before a row can reach "approved". Defensive, not a
      // silently-swallowed path: recorded exactly like any other build
      // failure, with the reason spelled out in the log.
      await fs.mkdir(buildLogDir, { recursive: true })
      await fs.writeFile(logPath, 'build_failed: this request has no resolved_sha recorded.\n')
      await finalizeBuildFailed(requestId, null, logPath)
      return
    }

    let contextDir: string | undefined
    try {
      const { buildContext } = BUILD_TARGETS[target]
      contextDir = await gitCheckout.prepareBuildContext(resolvedSha, buildContext)
      const dockerfileRelToContext = dockerfileRelativeToBuildContext(target)
      const imageTag = `ops-build/${target}:${resolvedSha}-${requestId}`

      const outcome = await runDockerBuild(docker, contextDir, dockerfileRelToContext, imageTag)

      await fs.mkdir(buildLogDir, { recursive: true })
      await fs.writeFile(logPath, outcome.logLines.join('\n') + '\n')

      if (!outcome.ok) {
        await finalizeBuildFailed(requestId, outcome.exitCode, logPath, outcome.errorMessage)
        return
      }

      const imageDigest = await inspectImageDigest(docker, imageTag)
      await withLockedBuildRequest(pool, requestId, async (client, row) => {
        assertTransitionAllowed(asState(row.state), 'built')
        const updated = await markBuilt(client, {
          requestId,
          buildExitCode: outcome.exitCode ?? 0,
          buildLogRef: logPath,
          imageLocalTag: imageTag,
          imageDigest,
        })
        await writeAudit(client, {
          requestId,
          event: 'build_request.build_finish',
          outcome: 'success',
          actorSignal: null,
          detail: { imageLocalTag: imageTag, imageDigest, buildLogRef: logPath },
        })
        return updated
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await fs.mkdir(buildLogDir, { recursive: true }).catch(() => undefined)
      await fs.writeFile(logPath, `build_failed: unexpected error: ${message}\n`).catch(() => undefined)
      await finalizeBuildFailed(requestId, null, logPath, message)
    } finally {
      if (contextDir) {
        await gitCheckout.cleanupBuildContext(contextDir)
      }
    }
  }

  async function finalizeBuildFailed(
    requestId: string,
    exitCode: number | null,
    logPath: string,
    errorMessage?: string,
  ): Promise<void> {
    await withLockedBuildRequest(pool, requestId, async (client, row) => {
      assertTransitionAllowed(asState(row.state), 'build_failed')
      const updated = await markBuildFailed(client, { requestId, buildExitCode: exitCode, buildLogRef: logPath })
      await writeAudit(client, {
        requestId,
        event: 'build_request.build_finish',
        outcome: 'error',
        actorSignal: null,
        detail: { buildExitCode: exitCode, buildLogRef: logPath, error: errorMessage ?? null },
      })
      return updated
    })
  }

  return { runBuild }
}

interface DockerBuildOutcome {
  ok: boolean
  exitCode: number | null
  errorMessage?: string
  logLines: string[]
}

/**
 * Runs `docker build` via dockerode's `buildImage`, against whichever daemon
 * `docker` is already constructed to talk to (the isolated build-daemon --
 * see src/index.ts's wiring, never this repo's own host daemon). The classic
 * builder's stream has no single "exit code" the way a process does; a
 * failed build step is instead reported as a JSON line carrying an `error`
 * field within an otherwise-200 stream, so this scans the collected output
 * for one rather than trusting the promise settling as success.
 *
 * Deliberately parses the newline-delimited-JSON stream itself (see
 * `collectBuildEvents`) rather than dockerode's own `followProgress` helper:
 * `@types/dockerode` does not declare `followProgress` (or the `modem`
 * property it hangs off) on its public `Dockerode` class at all, even though
 * the runtime package has it -- reaching for it would mean an unchecked
 * `any`/cast escape hatch for a type gap in a third-party package, which this
 * project's lint config (`no-explicit-any: error`) treats as a smell, not a
 * shortcut. The stream itself IS part of the public, typed API
 * (`Promise<NodeJS.ReadableStream>`), so consuming it directly stays fully
 * type-safe.
 */
async function runDockerBuild(
  docker: Docker,
  contextDir: string,
  dockerfileRelToContext: string,
  imageTag: string,
): Promise<DockerBuildOutcome> {
  const stream = await docker.buildImage(
    { context: contextDir, src: ['.'] },
    { t: imageTag, dockerfile: dockerfileRelToContext, rm: true, forcerm: true },
  )

  const events = await collectBuildEvents(stream)
  const logLines = events.map((event) => JSON.stringify(event))
  const errorEvent = events.find(
    (event): event is { error: string } =>
      typeof event === 'object' && event !== null && typeof (event as { error?: unknown }).error === 'string',
  )

  if (errorEvent) {
    return { ok: false, exitCode: 1, errorMessage: errorEvent.error, logLines }
  }
  return { ok: true, exitCode: 0, logLines }
}

/**
 * Parses the Docker build API's newline-delimited-JSON progress stream into
 * one JS value per line. A line that (unexpectedly) isn't valid JSON is kept
 * as `{ raw: line }` rather than silently dropped, so nothing observed on the
 * wire is ever lost from the persisted build log.
 */
function collectBuildEvents(stream: NodeJS.ReadableStream): Promise<unknown[]> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const events: unknown[] = []

    stream.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString()
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line.length > 0) {
          try {
            events.push(JSON.parse(line))
          } catch {
            events.push({ raw: line })
          }
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })
    stream.on('error', (err: Error) => reject(err))
    stream.on('end', () => resolve(events))
  })
}

/**
 * The classic build API does not reliably return the resulting image's
 * digest inline, so this asks the daemon directly once the build succeeds --
 * `Id` on a local image inspect is the same `sha256:...` value this service's
 * `image_digest` column is meant to hold.
 */
async function inspectImageDigest(docker: Docker, imageTag: string): Promise<string | null> {
  try {
    const info = await docker.getImage(imageTag).inspect()
    return info.Id ?? null
  } catch {
    return null
  }
}

function asState(state: string): BuildRequestState {
  return state as BuildRequestState
}
