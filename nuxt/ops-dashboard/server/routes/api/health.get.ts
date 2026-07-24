import { getRuntimeProvider } from '../../runtime/singleton'

/** Aggregated health report: totals plus a per-compose-service rollup. */
export default defineEventHandler(async () => {
  const provider = getRuntimeProvider()
  return await provider.getHealth()
})
