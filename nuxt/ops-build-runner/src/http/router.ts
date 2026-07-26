/**
 * A tiny, hand-rolled router over plain `node:http` -- NOT Express/Fastify.
 *
 * Justification (per the plan's explicit ask to justify the framework
 * choice): this service exposes exactly 7 routes, all JSON in/JSON out, none
 * of them needing streaming bodies, cookies, view rendering, or middleware
 * ecosystems. This monorepo's own general preference is lean dependencies
 * (see python/services' minimal FastAPI usage and nuxt/ops-dashboard's own
 * "don't add @nuxt/test-utils when plain vitest suffices" calls in its
 * DecisionLog) -- reaching for Express/Fastify here would add a dependency
 * (and its own transitive tree) to solve a routing problem that a ~60-line,
 * fully test-covered module solves just as correctly for a surface this
 * small. If this service's route count or requirements grow materially in a
 * later phase, revisit this choice rather than assuming it forever.
 */

export interface RequestContext {
  method: string
  path: string
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
  remoteAddress: string | undefined
  authorizationHeader: string | undefined
}

export interface RouteResult {
  status: number
  body?: unknown
}

export type RouteHandler = (ctx: RequestContext) => Promise<RouteResult>

interface CompiledRoute {
  method: string
  segments: string[]
  handler: RouteHandler
}

export class Router {
  private readonly routes: CompiledRoute[] = []

  add(method: string, pattern: string, handler: RouteHandler): void {
    this.routes.push({
      method: method.toUpperCase(),
      segments: pattern.split('/').filter((segment) => segment.length > 0),
      handler,
    })
  }

  get(pattern: string, handler: RouteHandler): void {
    this.add('GET', pattern, handler)
  }

  post(pattern: string, handler: RouteHandler): void {
    this.add('POST', pattern, handler)
  }

  /**
   * Matches `method`+`path` against every registered route. Returns the
   * handler and the extracted `:param` values, or `undefined` if nothing
   * matches (the caller responds 404).
   */
  match(
    method: string,
    path: string,
  ): { handler: RouteHandler; params: Record<string, string> } | undefined {
    const pathSegments = path.split('/').filter((segment) => segment.length > 0)

    for (const route of this.routes) {
      if (route.method !== method.toUpperCase()) continue
      if (route.segments.length !== pathSegments.length) continue

      const params: Record<string, string> = {}
      let matched = true
      for (let i = 0; i < route.segments.length; i++) {
        const routeSegment = route.segments[i] as string
        const pathSegment = pathSegments[i] as string
        if (routeSegment.startsWith(':')) {
          params[routeSegment.slice(1)] = decodeURIComponent(pathSegment)
        } else if (routeSegment !== pathSegment) {
          matched = false
          break
        }
      }

      if (matched) return { handler: route.handler, params }
    }

    return undefined
  }
}
