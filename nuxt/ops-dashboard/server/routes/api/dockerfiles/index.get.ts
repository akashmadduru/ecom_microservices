import { listDockerfiles } from '../../../runtime/dockerfile-registry'

/**
 * List the fixed, hardcoded allowlist of Dockerfiles this dashboard displays
 * (see `dockerfile-registry.ts`'s own doc comment) — never a filesystem glob,
 * never derived from any request input.
 */
export default defineEventHandler(async () => {
  const dockerfiles = await listDockerfiles()
  return { dockerfiles }
})
