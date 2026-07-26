import type { DockerfileDetail, DockerfileStage } from './types'

/**
 * Pure parser: raw Dockerfile text -> the structured fields this dashboard
 * displays. Read-only, display-only — this never writes back to a Dockerfile
 * and never executes anything it parses (no shelling out, no `docker build`).
 *
 * Only the LAST `FROM` stage's `EXPOSE`/`ENTRYPOINT`/`CMD`/`ENV` are surfaced
 * as the Dockerfile's "shipped" config: every earlier stage is build-time-only
 * and doesn't describe the image that actually ships (mirrors how `docker
 * inspect` only ever reports the final image's config, never an intermediate
 * builder stage's). `ARG` names are collected across the WHOLE file, since
 * build args are a build-time-only concept without a "shipped" analog to
 * narrow to — this only matters if a future Dockerfile in the fixed allowlist
 * ever adds one; none of the 7 grounding this parser do today.
 *
 * `argNames`/`envNames` are NAMES ONLY, never values. This mirrors this app's
 * existing `ContainerDetail.envKeys`-only precedent (see
 * DecisionLog.md#env-keys-only-not-values), even though the risk profile here
 * is genuinely lower: a Dockerfile's `ARG`/`ENV` defaults are already-committed
 * source in this repo, not a runtime-injected secret the way a running
 * container's environment is. Names-only is kept anyway for consistency with
 * this app's stated posture, not because a real secret is expected here.
 */

interface StageAccumulator {
  name: string | null
  baseImage: string
  exposedPorts: number[]
  entrypoint: string | null
  cmd: string | null
  envNames: string[]
}

// Optional `--platform=...`-style flags before the image ref; optional `AS <name>` alias.
const FROM_PATTERN = /^FROM\s+(?:--\S+\s+)*(\S+)(?:\s+AS\s+(\S+))?/i
const ARG_PATTERN = /^ARG\s+([A-Za-z_][A-Za-z0-9_]*)/i
const INSTRUCTION_PATTERN = /^([A-Za-z]+)\s*(.*)$/
// Modern `ENV KEY=VALUE [KEY2=VALUE2 ...]` form — matches each `KEY=` token.
const ENV_KEY_PATTERN = /([A-Za-z_][A-Za-z0-9_]*)=/g
// Legacy `ENV KEY value` (single pair, no `=`) form — none of this repo's 7
// Dockerfiles use it today, but a real Dockerfile instruction this parser
// should not silently drop if one ever does.
const ENV_LEGACY_PATTERN = /^ENV\s+([A-Za-z_][A-Za-z0-9_]*)\s+\S/i

/**
 * Join `\`-continued lines into single logical instructions before parsing —
 * required for this repo's own `HEALTHCHECK ... CMD \` + continuation lines
 * (see the four Python services' Dockerfiles), so the continued line isn't
 * mistaken for its own top-level instruction.
 */
function joinContinuations(raw: string): string[] {
  const rawLines = raw.split(/\r?\n/)
  const logical: string[] = []
  let buffer = ''
  for (const line of rawLines) {
    const combined = buffer ? `${buffer} ${line.trim()}` : line
    if (/\\\s*$/.test(combined)) {
      buffer = combined.replace(/\\\s*$/, '').trimEnd()
      continue
    }
    buffer = ''
    logical.push(combined)
  }
  if (buffer) logical.push(buffer)
  return logical
}

/** `ENTRYPOINT`/`CMD` accept either JSON exec form (`["a","b"]`) or shell form. */
function parseExecOrShellForm(remainder: string): string | null {
  const trimmed = remainder.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map(String).join(' ')
    } catch {
      // Not valid JSON after all — fall through and treat as shell form.
    }
  }
  return trimmed
}

/** `EXPOSE 8080 443/tcp` -> `[8080, 443]`; a bare protocol suffix is stripped. */
function parseExposedPorts(remainder: string): number[] {
  return remainder
    .trim()
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => Number.parseInt(token.split('/')[0] ?? '', 10))
    .filter((port) => Number.isFinite(port))
}

/** Result shape excludes `id`/`label`/`buildContext` — those come from the manifest entry, not the raw text. */
export type ParsedDockerfile = Omit<DockerfileDetail, 'id' | 'label' | 'buildContext'>

export function parseDockerfile(rawContent: string): ParsedDockerfile {
  const lines = joinContinuations(rawContent)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  const stages: StageAccumulator[] = []
  const argNames = new Set<string>()
  let current: StageAccumulator | null = null

  for (const line of lines) {
    const fromMatch = line.match(FROM_PATTERN)
    if (fromMatch) {
      current = {
        name: fromMatch[2] ?? null,
        baseImage: fromMatch[1] ?? '',
        exposedPorts: [],
        entrypoint: null,
        cmd: null,
        envNames: [],
      }
      stages.push(current)
      continue
    }

    const argMatch = line.match(ARG_PATTERN)
    if (argMatch?.[1]) {
      argNames.add(argMatch[1])
      continue
    }

    if (!current) continue // Nothing else is meaningful before the first FROM.

    const instructionMatch = line.match(INSTRUCTION_PATTERN)
    if (!instructionMatch) continue
    const [, instructionRaw, remainder] = instructionMatch
    if (!instructionRaw) continue

    switch (instructionRaw.toUpperCase()) {
      case 'EXPOSE':
        current.exposedPorts.push(...parseExposedPorts(remainder ?? ''))
        break
      case 'ENTRYPOINT':
        current.entrypoint = parseExecOrShellForm(remainder ?? '')
        break
      case 'CMD':
        // A `HEALTHCHECK ... CMD ...` line is its own instruction (starts with
        // HEALTHCHECK, already handled — or rather, ignored — above); this
        // branch only ever sees a genuine top-level `CMD`.
        current.cmd = parseExecOrShellForm(remainder ?? '')
        break
      case 'ENV': {
        const keyMatches = [...(remainder ?? '').matchAll(ENV_KEY_PATTERN)].map((m) => m[1]).filter(
          (k): k is string => Boolean(k),
        )
        if (keyMatches.length > 0) {
          current.envNames.push(...keyMatches)
        } else {
          const legacy = line.match(ENV_LEGACY_PATTERN)
          if (legacy?.[1]) current.envNames.push(legacy[1])
        }
        break
      }
      default:
        break
    }
  }

  const finalStage = stages[stages.length - 1] ?? null
  const stageSummaries: DockerfileStage[] = stages.map((s) => ({ name: s.name, baseImage: s.baseImage }))

  return {
    stages: stageSummaries,
    stageCount: stages.length,
    baseImage: finalStage?.baseImage ?? '',
    exposedPorts: finalStage?.exposedPorts ?? [],
    entrypoint: finalStage?.entrypoint ?? null,
    cmd: finalStage?.cmd ?? null,
    argNames: [...argNames],
    envNames: [...new Set(finalStage?.envNames ?? [])],
    rawContent,
  }
}
