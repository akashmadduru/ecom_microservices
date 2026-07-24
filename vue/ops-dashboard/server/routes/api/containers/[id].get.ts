import { getRuntimeProvider } from '../../../runtime/singleton'
import { assertValidContainerId, translateDockerNotFound } from '../../../runtime/container-request'

/** Inspect a single container (uses structured State.Health.Status). */
export default defineEventHandler(async (event) => {
  const id = assertValidContainerId(getRouterParam(event, 'id'))

  const provider = getRuntimeProvider()
  try {
    return await provider.inspectContainer(id)
  } catch (err: unknown) {
    translateDockerNotFound(err, id)
  }
})
