import http from 'node:http'
import { HttpError, ValidationError } from '../errors.js'
import { assertAuthorized } from './auth.js'
import type { RequestContext, Router } from './router.js'

// Bounds request-body size unconditionally -- this API's largest legitimate
// payload (a create-build-request body) is a few hundred bytes; 1MB is
// generous headroom without leaving the limit effectively unbounded.
const MAX_BODY_BYTES = 1_000_000

export function createHttpServer(router: Router, getBuildRunnerToken: () => string | undefined): http.Server {
  return http.createServer((req, res) => {
    void handleRequest(req, res, router, getBuildRunnerToken)
  })
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  router: Router,
  getBuildRunnerToken: () => string | undefined,
): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const authorizationHeader = firstHeaderValue(req.headers.authorization)

    // (1) auth, before anything else -- including before route matching, so
    // an unauthenticated caller learns nothing about which paths exist.
    assertAuthorized(authorizationHeader, getBuildRunnerToken())

    const matched = router.match(req.method ?? 'GET', url.pathname)
    if (!matched) {
      respondJson(res, 404, { error: 'Not Found' })
      return
    }

    const body = await readJsonBody(req)

    const ctx: RequestContext = {
      method: req.method ?? 'GET',
      path: url.pathname,
      params: matched.params,
      query: url.searchParams,
      body,
      remoteAddress: req.socket.remoteAddress,
      authorizationHeader,
    }

    const result = await matched.handler(ctx)
    respondJson(res, result.status, result.body)
  } catch (err) {
    if (err instanceof HttpError) {
      respondJson(res, err.statusCode, { error: err.message })
      return
    }
    console.error(
      JSON.stringify({
        event: 'ops-build-runner.unhandled-error',
        ts: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      }),
    )
    respondJson(res, 500, { error: 'Internal Server Error' })
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function respondJson(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = body === undefined ? '' : JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(payload)
}

async function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined

  const chunks: Buffer[] = []
  let totalBytes = 0

  for await (const chunk of req) {
    const buf = chunk as Buffer
    totalBytes += buf.length
    if (totalBytes > MAX_BODY_BYTES) {
      throw new ValidationError('Request body too large.')
    }
    chunks.push(buf)
  }

  if (chunks.length === 0) return undefined

  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim().length === 0) return undefined

  try {
    return JSON.parse(raw)
  } catch {
    throw new ValidationError('Request body must be valid JSON.')
  }
}
