import { getRuntimeProvider } from '../../../runtime/singleton'

/** List container images. */
export default defineEventHandler(async () => {
  const provider = getRuntimeProvider()
  const images = await provider.listImages()
  return { images }
})
