import path from 'node:path'

/**
 * The hardcoded build-target allowlist. Exactly 7 entries, matching the
 * approved architecture -- NEVER derived from request input, config, a
 * database row, or a directory scan. Adding a target is a deliberate code
 * change (and, per the approved architecture, its own review), not a runtime
 * configuration option.
 *
 * `dockerfilePath` / `buildContext` are relative to the monorepo root. Phase 1
 * does not check these paths out or build anything with them -- that is
 * `GitAncestorGuard`'s and Phase 2's job (see git-ancestor-guard.ts). They are
 * defined here now so Phase 2 has a single, already-reviewed source of truth
 * to build against instead of inventing one under time pressure.
 */
export const BUILD_TARGETS = {
  'ops-dashboard': {
    dockerfilePath: 'nuxt/ops-dashboard/Dockerfile',
    buildContext: 'nuxt/ops-dashboard',
  },
  'api-gateway': {
    dockerfilePath: 'python/services/api_gateway/Dockerfile',
    buildContext: '.',
  },
  'auth-service': {
    dockerfilePath: 'python/services/auth_service/Dockerfile',
    buildContext: '.',
  },
  'inventory-service': {
    dockerfilePath: 'python/services/inventory_service/Dockerfile',
    buildContext: '.',
  },
  'product-service': {
    dockerfilePath: 'python/services/product_service/Dockerfile',
    buildContext: '.',
  },
  'ecom-admin': {
    dockerfilePath: 'vue/apps/ecom-admin/Dockerfile',
    buildContext: 'vue',
  },
  'ecom-web': {
    dockerfilePath: 'vue/apps/ecom-web/Dockerfile',
    buildContext: 'vue',
  },
} as const

export type BuildTarget = keyof typeof BUILD_TARGETS

const BUILD_TARGET_KEYS = Object.keys(BUILD_TARGETS) as BuildTarget[]

export function isBuildTarget(value: string): value is BuildTarget {
  return (BUILD_TARGET_KEYS as string[]).includes(value)
}

/**
 * `dockerfilePath`/`buildContext` are both relative to the monorepo root
 * (see this file's own doc comment). The Docker Engine API's build endpoint
 * wants the Dockerfile's path RELATIVE TO THE BUILD CONTEXT it is given, not
 * the monorepo root -- BuildOrchestrator hands `GitCheckoutManager`'s context
 * subdirectory to dockerode as the tar root, so this converts once, here,
 * rather than duplicating the path arithmetic at every call site.
 *
 * `path.posix` deliberately -- these are repo-relative paths recorded as
 * literal forward-slash string constants above, never OS filesystem paths.
 */
export function dockerfileRelativeToBuildContext(target: BuildTarget): string {
  const { dockerfilePath, buildContext } = BUILD_TARGETS[target]
  return path.posix.relative(buildContext, dockerfilePath)
}
