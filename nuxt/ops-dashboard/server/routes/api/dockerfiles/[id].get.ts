import { findDockerfile } from '../../../runtime/dockerfile-registry'
import { assertValidResourceId } from '../../../runtime/container-request'

/**
 * Inspect one Dockerfile's parsed detail (stages, exposed ports,
 * entrypoint/cmd, arg/env names, raw source) by its fixed allowlist id.
 * `assertValidResourceId` is reused rather than a new pattern — this
 * feature's ids are simple hyphenated slugs (`api-gateway`, `ecom-web`, ...),
 * the exact same charset that pattern already covers for network/volume ids
 * (see that function's own doc comment).
 */
export default defineEventHandler(async (event) => {
  const id = assertValidResourceId(getRouterParam(event, 'id'))

  const detail = await findDockerfile(id)
  if (!detail) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `No such Dockerfile: ${id}` })
  }
  return detail
})
