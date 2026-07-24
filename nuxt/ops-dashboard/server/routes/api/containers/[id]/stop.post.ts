import { assertValidContainerId } from '../../../../runtime/container-request'
import { runContainerMutation } from '../../../../runtime/mutation-guard'

/**
 * Stop a container. Gated by the global kill switch + per-service allowlist
 * inside `runContainerMutation`. "Disable" is a synonym for stop: a stopped
 * container stays stopped until explicitly started again.
 */
export default defineEventHandler(async (event) => {
  const id = assertValidContainerId(getRouterParam(event, 'id'))
  return await runContainerMutation('stop', id)
})
