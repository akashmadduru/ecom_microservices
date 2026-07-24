import { getRuntimeProvider } from '../../../runtime/singleton'

/** List Docker networks. */
export default defineEventHandler(async () => {
  const provider = getRuntimeProvider()
  const networks = await provider.listNetworks()
  return { networks }
})
