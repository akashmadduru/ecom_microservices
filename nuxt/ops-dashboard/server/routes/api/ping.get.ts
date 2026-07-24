import { getRuntimeProvider } from '../../runtime/singleton'

/** Readiness-style probe: is the (proxied) Docker engine reachable? */
export default defineEventHandler(async () => {
  const provider = getRuntimeProvider()
  const ok = await provider.ping()
  return { ok }
})
