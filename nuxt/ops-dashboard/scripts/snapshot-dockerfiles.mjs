#!/usr/bin/env node
// @ts-check
/**
 * Snapshots this monorepo's own Dockerfiles into
 * `nuxt/ops-dashboard/server/generated/dockerfile-manifest.json` — a
 * build-time artifact, gitignored, regenerated fresh each time, never
 * committed source.
 *
 * WHY THIS SCRIPT EXISTS AT ALL: `ops-dashboard/` is deliberately a
 * standalone project with zero runtime filesystem access to any monorepo-
 * relative path (see docs/apps/ops-dashboard/DecisionLog.md#standalone-
 * copy-outable-design) — its own Dockerfile only ever COPYs its own
 * directory. Reading the other 6 Dockerfiles below therefore cannot happen
 * at request time from inside the running app; it has to happen once, ahead
 * of time, wherever the FULL monorepo checkout is actually present (a CI job
 * with a full `actions/checkout`, or a developer's local clone) — this
 * script is that one place.
 *
 * THE FIXED ALLOWLIST — hardcoded here, and ONLY here. This is deliberately
 * NOT a filesystem glob: the Dockerfile-discovery feature this manifest
 * powers (`server/runtime/dockerfile-registry.ts`) shows exactly these 7
 * Dockerfiles and nothing else, ever, regardless of what else might exist on
 * disk when this script runs.
 *
 * KNOWN, ACCEPTED EXCEPTION to the "standalone, copy-out-able" design goal:
 * this script hardcodes monorepo-relative paths (`python/services/...`,
 * `vue/apps/...`) and assumes it lives at `nuxt/ops-dashboard/scripts/`
 * within that monorepo. If `ops-dashboard/` is ever copied out to another
 * repo, this ONE feature (Dockerfile discovery) will not work unmodified —
 * documented explicitly in README.md rather than silently contradicting the
 * project's standalone claim elsewhere.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** @typedef {{ id: string, label: string, dockerfilePath: string, buildContext: string }} FixedEntry */

/** @type {FixedEntry[]} */
const FIXED_ENTRIES = [
  {
    id: 'ops-dashboard',
    label: 'ops-dashboard',
    dockerfilePath: 'nuxt/ops-dashboard/Dockerfile',
    buildContext: 'nuxt/ops-dashboard',
  },
  {
    id: 'api-gateway',
    label: 'api-gateway',
    dockerfilePath: 'python/services/api_gateway/Dockerfile',
    buildContext: '.',
  },
  {
    id: 'auth-service',
    label: 'auth-service',
    dockerfilePath: 'python/services/auth_service/Dockerfile',
    buildContext: '.',
  },
  {
    id: 'inventory-service',
    label: 'inventory-service',
    dockerfilePath: 'python/services/inventory_service/Dockerfile',
    buildContext: '.',
  },
  {
    id: 'product-service',
    label: 'product-service',
    dockerfilePath: 'python/services/product_service/Dockerfile',
    buildContext: '.',
  },
  {
    id: 'ecom-admin',
    label: 'ecom-admin',
    dockerfilePath: 'vue/apps/ecom-admin/Dockerfile',
    buildContext: 'vue',
  },
  {
    id: 'ecom-web',
    label: 'ecom-web',
    dockerfilePath: 'vue/apps/ecom-web/Dockerfile',
    buildContext: 'vue',
  },
]

// Resolved from THIS FILE'S OWN location (not `process.cwd()`), so this works
// identically whether invoked as `node nuxt/ops-dashboard/scripts/snapshot-
// dockerfiles.mjs` from the repo root (CI) or as `npm run snapshot-
// dockerfiles` from within nuxt/ops-dashboard/ (local dev) — both land on the
// same computed repoRoot. scripts/ -> ops-dashboard/ -> nuxt/ -> repo root.
const scriptDir = dirname(fileURLToPath(import.meta.url))
const opsDashboardDir = resolve(scriptDir, '..')
const repoRoot = resolve(scriptDir, '..', '..', '..')
const manifestPath = join(opsDashboardDir, 'server', 'generated', 'dockerfile-manifest.json')

/** One of the 7 fixed paths, used purely as a "is the full monorepo actually
 * here" probe — NOT as a request-driven lookup. */
const PROBE_PATH = join(repoRoot, 'python/services/api_gateway/Dockerfile')

function writeManifest(entries, note) {
  mkdirSync(dirname(manifestPath), { recursive: true })
  const manifest = {
    generatedAt: new Date().toISOString(),
    ...(note ? { note } : {}),
    entries,
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8')
}

function main() {
  if (!existsSync(PROBE_PATH)) {
    // We can't see the rest of the monorepo from here — expected inside a
    // Docker build context narrowed to nuxt/ops-dashboard/ only (see this
    // project's Dockerfile: its `COPY . .` never brings in the other 6
    // services' files). Do NOT overwrite an already-correct manifest that a
    // prior CI step already generated from a full checkout and COPY'd in.
    if (existsSync(manifestPath)) {
      console.log(
        '[snapshot-dockerfiles] Full monorepo not visible from here (expected inside a narrowed Docker ' +
          'build context) — leaving the existing manifest at server/generated/dockerfile-manifest.json untouched.',
      )
      return
    }
    console.warn(
      '[snapshot-dockerfiles] Full monorepo not visible from here, and no manifest exists yet — writing an ' +
        'empty-but-valid manifest so the app does not crash. Run this script from the repo root (or ' +
        '`npm run snapshot-dockerfiles` from nuxt/ops-dashboard/, with the full monorepo checked out) to ' +
        'populate it for real.',
    )
    writeManifest([], 'Empty fallback: the full monorepo was not visible when this ran.')
    return
  }

  const entries = FIXED_ENTRIES.map((fixed) => {
    const absolutePath = join(repoRoot, fixed.dockerfilePath)
    if (!existsSync(absolutePath)) {
      // Unlike the "narrowed build context" case above, THIS is a real
      // problem: the probe file exists (so we trust we're at the real repo
      // root) but one of the 7 fixed, supposedly-always-present Dockerfiles
      // is missing. Fail loudly rather than silently shipping a partial list.
      throw new Error(
        `[snapshot-dockerfiles] Expected Dockerfile not found: ${fixed.dockerfilePath} ` +
          `(resolved to ${absolutePath}). The fixed allowlist in this script is stale — fix the path ` +
          'or remove the entry, do not silently skip it.',
      )
    }
    return {
      id: fixed.id,
      label: fixed.label,
      dockerfilePath: fixed.dockerfilePath,
      buildContext: fixed.buildContext,
      rawContent: readFileSync(absolutePath, 'utf-8'),
    }
  })

  writeManifest(entries)
  console.log(
    `[snapshot-dockerfiles] Wrote ${entries.length} Dockerfile(s) to ` +
      'nuxt/ops-dashboard/server/generated/dockerfile-manifest.json',
  )
}

main()
