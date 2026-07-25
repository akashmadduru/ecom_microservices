import { getRuntimeProvider } from '../../../runtime/singleton'
import { assertValidImageId, translateDockerNotFound } from '../../../runtime/container-request'

/** Inspect a single image (labels, layers, history, referencing containers). */
export default defineEventHandler(async (event) => {
  const id = assertValidImageId(getRouterParam(event, 'id'))

  const provider = getRuntimeProvider()
  try {
    return await provider.inspectImage(id)
  } catch (err: unknown) {
    translateDockerNotFound(err, id, 'image')
  }
})
