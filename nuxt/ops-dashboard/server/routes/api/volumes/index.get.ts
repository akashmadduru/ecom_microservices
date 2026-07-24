import { getRuntimeProvider } from '../../../runtime/singleton'

/** List Docker volumes. */
export default defineEventHandler(async () => {
  const provider = getRuntimeProvider()
  const volumes = await provider.listVolumes()
  return { volumes }
})
