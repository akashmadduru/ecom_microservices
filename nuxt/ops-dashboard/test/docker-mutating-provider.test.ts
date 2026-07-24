import type Docker from 'dockerode'
import { describe, expect, it, vi } from 'vitest'
import { DockerMutatingProvider } from '../server/runtime/docker-mutating-provider'

/**
 * The mutating provider is a thin passthrough to dockerode's
 * getContainer(id).stop()/start()/restart(). We only assert it targets the
 * requested container and calls the matching verb — the gating/allowlist logic
 * lives in the route layer (see mutation-route.test.ts), not here.
 */
function fakeDocker() {
  const stop = vi.fn().mockResolvedValue(undefined)
  const start = vi.fn().mockResolvedValue(undefined)
  const restart = vi.fn().mockResolvedValue(undefined)
  const getContainer = vi.fn().mockReturnValue({ stop, start, restart })
  const docker = { getContainer } as unknown as Docker
  return { docker, getContainer, stop, start, restart }
}

describe('DockerMutatingProvider', () => {
  it('stopContainer targets the given id and calls stop() (happy path)', async () => {
    const { docker, getContainer, stop } = fakeDocker()
    await new DockerMutatingProvider(docker).stopContainer('abc123')
    expect(getContainer).toHaveBeenCalledWith('abc123')
    expect(stop).toHaveBeenCalledTimes(1)
  })

  it('startContainer calls start() and restartContainer calls restart()', async () => {
    const { docker, start, restart } = fakeDocker()
    const provider = new DockerMutatingProvider(docker)
    await provider.startContainer('id1')
    await provider.restartContainer('id2')
    expect(start).toHaveBeenCalledTimes(1)
    expect(restart).toHaveBeenCalledTimes(1)
  })

  it('propagates a rejection from the underlying docker call (edge case)', async () => {
    const { docker, stop } = fakeDocker()
    stop.mockRejectedValueOnce(Object.assign(new Error('no such container'), { statusCode: 404 }))
    await expect(new DockerMutatingProvider(docker).stopContainer('gone')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})
