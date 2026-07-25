import { getRuntimeProvider } from '../../../runtime/singleton'
import { assertValidResourceId, translateDockerNotFound } from '../../../runtime/container-request'

/** Inspect a single volume. */
export default defineEventHandler(async (event) => {
  const id = assertValidResourceId(getRouterParam(event, 'id'))

  const provider = getRuntimeProvider()
  try {
    return await provider.inspectVolume(id)
  } catch (err: unknown) {
    translateDockerNotFound(err, id, 'volume')
  }
})
