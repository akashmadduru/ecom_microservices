import { assertValidContainerId } from '../../../../runtime/container-request'
import { runContainerMutation } from '../../../../runtime/mutation-guard'

/**
 * Restart a container. Gated by the global kill switch + per-service allowlist
 * inside `runContainerMutation`.
 */
export default defineEventHandler(async (event) => {
  const id = assertValidContainerId(getRouterParam(event, 'id'))
  return await runContainerMutation('restart', id)
})
