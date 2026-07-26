import { parseDockerfile } from './dockerfile-parse'
import type { DockerfileDetail, DockerfileSummary } from './types'

/**
 * Read-only registry over a FIXED, hardcoded allowlist of 7 Dockerfiles in
 * this monorepo (this app's own, plus the 4 Python services' and the 2 Vue
 * apps'). There is NO filesystem glob anywhere in this module or its callers
 * — the only paths that were ever read are the ones
 * `scripts/snapshot-dockerfiles.mjs` hardcodes (see that script's own doc
 * comment for the exact 7), captured ahead of time into a manifest bundled as
 * a Nitro server asset. No request parameter is ever used to construct a
 * filesystem path anywhere in this feature.
 *
 * Why a pre-built manifest instead of reading the files directly at request
 * time: this app has zero filesystem access to any host/monorepo path at
 * runtime today (a deliberate property — see
 * DecisionLog.md#standalone-copy-outable-design), and reading
 * `../../python/services/...`-shaped paths directly would both break that
 * property AND fail entirely once this image is actually deployed (the
 * running container only ever has `nuxt/ops-dashboard`'s own files, per its
 * Dockerfile's `COPY . .`). The manifest is generated once, ahead of time, by
 * the snapshot script — see that script and README.md's "Dockerfile
 * discovery" section for the CI/local-dev wiring.
 *
 * This module reads the manifest via Nitro's `useStorage()` (a bare global,
 * like `defineEventHandler`/`getRouterParam` elsewhere in `server/routes/**` —
 * see test/dockerfile-registry.test.ts for why we stub it the same way those
 * tests stub the other Nitro globals, rather than importing
 * `nitropack/runtime` directly, which would pull in a Nitro-internal virtual
 * module specifier that only resolves inside Nitro's own build). The asset is
 * registered in `nuxt.config.ts` (`nitro.serverAssets`, baseName
 * `generated`, pointed at `server/generated/`), which bundles whatever
 * `server/generated/dockerfile-manifest.json` contains at BUILD time — so it
 * survives being compiled into `.output/server` correctly, unlike a plain
 * runtime `fs.readFileSync` call would (Nitro's bundler has no static
 * visibility into an opaque runtime fs path, only into files registered this
 * way or imported as real ES modules).
 *
 * Missing manifest (fresh clone, snapshot never run) is NOT a crash: this
 * degrades to an empty list plus a console warning, both here and in
 * `scripts/snapshot-dockerfiles.mjs`'s own fallback behavior.
 */

const ASSET_MOUNT = 'assets:generated'
const ASSET_KEY = 'dockerfile-manifest.json'

interface ManifestEntry {
  id: string
  label: string
  dockerfilePath: string
  buildContext: string
  rawContent: string
}

interface Manifest {
  generatedAt: string
  entries: ManifestEntry[]
}

// Cached for the process lifetime after first load — mirrors this app's
// existing lazy-singleton style elsewhere (e.g. `singleton.ts`'s dockerode
// clients), reasonable for a small tool that's restarted on every deploy and
// whose manifest is itself a build-time artifact, not something that changes
// while the process is running.
let cachedDetails: DockerfileDetail[] | null = null

async function loadManifestEntries(): Promise<ManifestEntry[]> {
  const raw = await useStorage(ASSET_MOUNT).getItem<string>(ASSET_KEY)
  if (!raw) {
    console.warn(
      `[ops-dashboard] Dockerfile manifest ("${ASSET_KEY}") not found among bundled server assets. ` +
        'Run `npm run snapshot-dockerfiles` from the repo root (or `npm run build`, whose `prebuild` ' +
        'hook does this automatically) to populate the Dockerfiles view. Returning an empty list, not failing.',
    )
    return []
  }
  try {
    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Manifest
    return Array.isArray(parsed?.entries) ? parsed.entries : []
  } catch (err) {
    console.warn('[ops-dashboard] Failed to parse the bundled Dockerfile manifest:', err)
    return []
  }
}

async function loadDetails(): Promise<DockerfileDetail[]> {
  if (!cachedDetails) {
    const entries = await loadManifestEntries()
    cachedDetails = entries.map((entry) => ({
      id: entry.id,
      label: entry.label,
      buildContext: entry.buildContext,
      ...parseDockerfile(entry.rawContent),
    }))
  }
  return cachedDetails
}

function toSummary(detail: DockerfileDetail): DockerfileSummary {
  return {
    id: detail.id,
    label: detail.label,
    buildContext: detail.buildContext,
    baseImage: detail.baseImage,
    exposedPorts: detail.exposedPorts,
    stageCount: detail.stageCount,
  }
}

/** List the fixed allowlist of Dockerfiles this dashboard knows about. */
export async function listDockerfiles(): Promise<DockerfileSummary[]> {
  return (await loadDetails()).map(toSummary)
}

/** Look up one Dockerfile's full parsed detail by id, or null if unknown (never a 500 for an unknown id). */
export async function findDockerfile(id: string): Promise<DockerfileDetail | null> {
  return (await loadDetails()).find((d) => d.id === id) ?? null
}
