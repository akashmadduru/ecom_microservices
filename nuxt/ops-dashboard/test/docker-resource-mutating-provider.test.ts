import type Docker from 'dockerode'
import { describe, expect, it, vi } from 'vitest'
import {
  DockerImageMutatingProvider,
  DockerNetworkMutatingProvider,
  DockerVolumeMutatingProvider,
} from '../server/runtime/docker-resource-mutating-provider'

/**
 * These providers are thin passthroughs to dockerode's getImage/getVolume/
 * getNetwork remove()/prune*() calls. We assert they target the requested
 * resource, call the matching verb, and — critically — that prune calls
 * NEVER pass a caller-supplied filter (images hardcode `dangling: true`,
 * volumes/networks pass no filter at all). Gating/allowlist logic lives in
 * resource-mutation-guard.ts (see resource-mutation-guard.test.ts), not here.
 */

describe('DockerImageMutatingProvider', () => {
  function fakeDocker(overrides: { remove?: ReturnType<typeof vi.fn>; pruneImages?: ReturnType<typeof vi.fn> } = {}) {
    const remove = overrides.remove ?? vi.fn().mockResolvedValue([{ Deleted: 'sha256:abc' }])
    const getImage = vi.fn().mockReturnValue({ remove })
    const pruneImages
      = overrides.pruneImages
        ?? vi.fn().mockResolvedValue({ ImagesDeleted: [{ Deleted: 'sha256:def' }], SpaceReclaimed: 1024 })
    const docker = { getImage, pruneImages } as unknown as Docker
    return { docker, getImage, remove, pruneImages }
  }

  it('removeImage targets the given id and returns the deleted digests', async () => {
    const { docker, getImage } = fakeDocker()
    const result = await new DockerImageMutatingProvider(docker).removeImage('sha256:abc')
    expect(getImage).toHaveBeenCalledWith('sha256:abc')
    expect(result).toEqual({ deleted: ['sha256:abc'] })
  })

  it('propagates a 404 from removeImage as a translated not-found error', async () => {
    const remove = vi.fn().mockRejectedValue(Object.assign(new Error('no such image'), { statusCode: 404 }))
    const { docker } = fakeDocker({ remove })
    await expect(new DockerImageMutatingProvider(docker).removeImage('gone')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('pruneImages hardcodes the dangling:true filter, never a caller-supplied one', async () => {
    const { docker, pruneImages } = fakeDocker()
    const result = await new DockerImageMutatingProvider(docker).pruneImages()
    expect(pruneImages).toHaveBeenCalledWith({ filters: { dangling: ['true'] } })
    expect(result).toEqual({ imagesDeleted: ['sha256:def'], spaceReclaimed: 1024 })
  })

  it('pruneImages defaults spaceReclaimed to 0 and imagesDeleted to [] on a sparse response', async () => {
    const { docker } = fakeDocker({ pruneImages: vi.fn().mockResolvedValue({}) })
    const result = await new DockerImageMutatingProvider(docker).pruneImages()
    expect(result).toEqual({ imagesDeleted: [], spaceReclaimed: 0 })
  })
})

describe('DockerVolumeMutatingProvider', () => {
  function fakeDocker(overrides: { remove?: ReturnType<typeof vi.fn>; pruneVolumes?: ReturnType<typeof vi.fn> } = {}) {
    const remove = overrides.remove ?? vi.fn().mockResolvedValue(undefined)
    const getVolume = vi.fn().mockReturnValue({ remove })
    const pruneVolumes
      = overrides.pruneVolumes
        ?? vi.fn().mockResolvedValue({ VolumesDeleted: ['pg-data'], SpaceReclaimed: 2048 })
    const docker = { getVolume, pruneVolumes } as unknown as Docker
    return { docker, getVolume, remove, pruneVolumes }
  }

  it('removeVolume targets the given name', async () => {
    const { docker, getVolume } = fakeDocker()
    await new DockerVolumeMutatingProvider(docker).removeVolume('pg-data')
    expect(getVolume).toHaveBeenCalledWith('pg-data')
  })

  it('propagates a 404 from removeVolume as a translated not-found error', async () => {
    const remove = vi.fn().mockRejectedValue(Object.assign(new Error('no such volume'), { statusCode: 404 }))
    const { docker } = fakeDocker({ remove })
    await expect(new DockerVolumeMutatingProvider(docker).removeVolume('gone')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('pruneVolumes passes NO filter (the engine default already scopes to unused volumes)', async () => {
    const { docker, pruneVolumes } = fakeDocker()
    const result = await new DockerVolumeMutatingProvider(docker).pruneVolumes()
    expect(pruneVolumes).toHaveBeenCalledWith()
    expect(result).toEqual({ volumesDeleted: ['pg-data'], spaceReclaimed: 2048 })
  })
})

describe('DockerNetworkMutatingProvider', () => {
  function fakeDocker(overrides: { remove?: ReturnType<typeof vi.fn>; pruneNetworks?: ReturnType<typeof vi.fn> } = {}) {
    const remove = overrides.remove ?? vi.fn().mockResolvedValue(undefined)
    const getNetwork = vi.fn().mockReturnValue({ remove })
    const pruneNetworks = overrides.pruneNetworks ?? vi.fn().mockResolvedValue({ NetworksDeleted: ['ecom_edge'] })
    const docker = { getNetwork, pruneNetworks } as unknown as Docker
    return { docker, getNetwork, remove, pruneNetworks }
  }

  it('removeNetwork targets the given id', async () => {
    const { docker, getNetwork } = fakeDocker()
    await new DockerNetworkMutatingProvider(docker).removeNetwork('net1')
    expect(getNetwork).toHaveBeenCalledWith('net1')
  })

  it('propagates a 404 from removeNetwork as a translated not-found error', async () => {
    const remove = vi.fn().mockRejectedValue(Object.assign(new Error('no such network'), { statusCode: 404 }))
    const { docker } = fakeDocker({ remove })
    await expect(new DockerNetworkMutatingProvider(docker).removeNetwork('gone')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('pruneNetworks passes NO filter', async () => {
    const { docker, pruneNetworks } = fakeDocker()
    const result = await new DockerNetworkMutatingProvider(docker).pruneNetworks()
    expect(pruneNetworks).toHaveBeenCalledWith()
    expect(result).toEqual({ networksDeleted: ['ecom_edge'] })
  })
})
