import { getRuntimeProvider } from '../../../runtime/singleton'

/** List all containers (running and stopped) as narrow summaries. */
export default defineEventHandler(async () => {
  const provider = getRuntimeProvider()
  const containers = await provider.listContainers()
  return { containers }
})
