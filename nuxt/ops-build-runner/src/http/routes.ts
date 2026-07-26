import { buildActorSignal } from '../actor-signal.js'
import { ValidationError } from '../errors.js'
import type { Queryable } from '../repository/types.js'
import { queryAuditLog } from '../repository/audit-log-repository.js'
import type { createBuildRequestService } from '../service/build-request-service.js'
import { Router } from './router.js'

type BuildRequestService = ReturnType<typeof createBuildRequestService>

function asRecord(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object.')
  }
  return body as Record<string, unknown>
}

function requireString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string') {
    throw new ValidationError(`"${field}" must be a string.`)
  }
  return value
}

/**
 * Wires the exact REST contract from the approved architecture onto the
 * tiny router. Every handler is a thin adapter: parse/shape the request,
 * delegate to the service layer (which owns validation ordering, the state
 * machine, and audit writes), shape the response.
 */
export function createRoutes(service: BuildRequestService, auditDb: Queryable): Router {
  const router = new Router()

  router.post('/build-requests', async (ctx) => {
    const body = asRecord(ctx.body)
    const target = requireString(body, 'target')
    const gitRef = requireString(body, 'gitRef')
    const reason = requireString(body, 'reason')
    const requesterSignal = buildActorSignal(ctx.remoteAddress)

    const result = await service.createBuildRequest({ target, gitRef, reason, requesterSignal })
    return { status: 201, body: result }
  })

  router.post('/build-requests/:id/approve', async (ctx) => {
    const body = asRecord(ctx.body)
    const approvalCode = requireString(body, 'approvalCode')
    const approverSignal = buildActorSignal(ctx.remoteAddress)

    const result = await service.approveBuildRequest(ctx.params.id as string, approvalCode, approverSignal)
    return { status: 200, body: result }
  })

  router.get('/build-requests/:id', async (ctx) => {
    const result = await service.getBuildRequest(ctx.params.id as string)
    return { status: 200, body: result }
  })

  router.post('/build-requests/:id/launch-request', async (ctx) => {
    const result = await service.requestLaunch(ctx.params.id as string)
    return { status: 200, body: result }
  })

  router.post('/build-requests/:id/launch-approve', async (ctx) => {
    const body = asRecord(ctx.body)
    const approvalCode = requireString(body, 'approvalCode')
    const approverSignal = buildActorSignal(ctx.remoteAddress)

    const result = await service.approveLaunch(ctx.params.id as string, approvalCode, approverSignal)
    return { status: 200, body: result }
  })

  router.post('/build-requests/:id/cancel', async (ctx) => {
    const result = await service.cancelBuildRequest(ctx.params.id as string)
    return { status: 200, body: result }
  })

  router.get('/audit', async (ctx) => {
    const requestId = ctx.query.get('requestId')
    const from = ctx.query.get('from')
    const to = ctx.query.get('to')

    // Built incrementally rather than passing `undefined` for absent
    // filters: with `exactOptionalPropertyTypes` on, an optional field must
    // be OMITTED, not present-with-value-undefined.
    const filter: Parameters<typeof queryAuditLog>[1] = {}
    if (requestId) filter.requestId = requestId
    if (from) filter.from = new Date(from)
    if (to) filter.to = new Date(to)

    const rows = await queryAuditLog(auditDb, filter)
    return { status: 200, body: rows }
  })

  return router
}
