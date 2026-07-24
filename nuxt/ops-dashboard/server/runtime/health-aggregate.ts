import type { ContainerSummary, HealthReport, HealthServiceRollup, HealthState } from './types'

/**
 * Aggregate a list of `ContainerSummary` (from EITHER backend — Docker
 * containers or Kubernetes pods, both already normalized to this shared DTO
 * by their respective providers) into a `HealthReport`.
 *
 * Extracted out of both providers' `getHealth()` because this logic operates
 * purely on the shared `ContainerSummary` shape and has nothing
 * backend-specific left in it once `listContainers()` has already normalized
 * state/health — keeping two copies would only create a place for the two
 * backends' rollups to silently drift on the next change (e.g. a new health
 * bucket), for no actual benefit.
 */
export function aggregateHealth(
  containers: ContainerSummary[],
  engineReachable: boolean,
): HealthReport {
  const totals = {
    containers: containers.length,
    running: 0,
    healthy: 0,
    unhealthy: 0,
    starting: 0,
    noHealthcheck: 0,
    stopped: 0,
  }

  const rollups = new Map<string, HealthServiceRollup>()

  for (const c of containers) {
    const isRunning = c.state === 'running'
    if (isRunning) totals.running += 1
    else totals.stopped += 1
    tallyHealth(totals, c.health)

    if (c.service !== null) {
      const key = `${c.project ?? ''}/${c.service}`
      const rollup = rollups.get(key) ?? {
        service: c.service,
        project: c.project,
        total: 0,
        running: 0,
        healthy: 0,
        unhealthy: 0,
        starting: 0,
      }
      rollup.total += 1
      if (isRunning) rollup.running += 1
      if (c.health === 'healthy') rollup.healthy += 1
      if (c.health === 'unhealthy') rollup.unhealthy += 1
      if (c.health === 'starting') rollup.starting += 1
      rollups.set(key, rollup)
    }
  }

  return {
    engineReachable,
    totals,
    services: [...rollups.values()].sort((a, b) => a.service.localeCompare(b.service)),
    generatedAt: new Date().toISOString(),
  }
}

function tallyHealth(totals: HealthReport['totals'], health: HealthState): void {
  switch (health) {
    case 'healthy':
      totals.healthy += 1
      break
    case 'unhealthy':
      totals.unhealthy += 1
      break
    case 'starting':
      totals.starting += 1
      break
    default:
      totals.noHealthcheck += 1
  }
}
