import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * server/runtime/dockerfile-registry.ts relies on Nitro's `useStorage` bare
 * global — the same pattern `server/routes/api/**` relies on for
 * `defineEventHandler`/`getRouterParam` (see test/mutation-route.test.ts /
 * test/logs-route.test.ts for the established rationale). We stub it here
 * rather than importing the real `nitropack/runtime` implementation, which
 * pulls in a Nitro-internal virtual module specifier (`#nitro-internal-
 * virtual/storage`) that only resolves inside Nitro's own build — not under
 * plain vitest.
 */

type FakeStorage = { getItem: (key: string) => Promise<string | null> }

function stubUseStorage(fake: FakeStorage): void {
  ;(globalThis as unknown as { useStorage: (base?: string) => FakeStorage }).useStorage = () => fake
}

async function importRegistry() {
  vi.resetModules()
  return import('../server/runtime/dockerfile-registry')
}

describe('dockerfile-registry', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warnSpy.mockRestore()
    delete (globalThis as { useStorage?: unknown }).useStorage
  })

  it('lists and inspects entries parsed from the bundled manifest (happy path)', async () => {
    const manifest = {
      generatedAt: '2026-07-25T00:00:00.000Z',
      entries: [
        {
          id: 'ops-dashboard',
          label: 'ops-dashboard',
          dockerfilePath: 'nuxt/ops-dashboard/Dockerfile',
          buildContext: 'nuxt/ops-dashboard',
          rawContent: 'FROM node:24-slim AS builder\nFROM node:24-slim AS runtime\nEXPOSE 3000\nCMD ["node", "index.mjs"]\n',
        },
        {
          id: 'api-gateway',
          label: 'api-gateway',
          dockerfilePath: 'python/services/api_gateway/Dockerfile',
          buildContext: '.',
          rawContent: 'FROM python:3.12-slim AS builder\nFROM python:3.12-slim\nEXPOSE 8080\n',
        },
      ],
    }
    stubUseStorage({ getItem: async () => JSON.stringify(manifest) })

    const { listDockerfiles, findDockerfile } = await importRegistry()

    const summaries = await listDockerfiles()
    expect(summaries).toHaveLength(2)
    expect(summaries[0]).toMatchObject({
      id: 'ops-dashboard',
      label: 'ops-dashboard',
      buildContext: 'nuxt/ops-dashboard',
      baseImage: 'node:24-slim',
      exposedPorts: [3000],
      stageCount: 2,
    })

    const detail = await findDockerfile('api-gateway')
    expect(detail).toMatchObject({
      id: 'api-gateway',
      buildContext: '.',
      exposedPorts: [8080],
      stageCount: 2,
    })
    expect(detail?.rawContent).toContain('python:3.12-slim')
  })

  it('returns null (never throws) for an unknown id', async () => {
    stubUseStorage({ getItem: async () => JSON.stringify({ generatedAt: '', entries: [] }) })
    const { findDockerfile } = await importRegistry()
    expect(await findDockerfile('does-not-exist')).toBeNull()
  })

  it('degrades to an empty list, not a crash, when the manifest asset is missing (edge case)', async () => {
    stubUseStorage({ getItem: async () => null })
    const { listDockerfiles } = await importRegistry()
    expect(await listDockerfiles()).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
  })

  it('degrades to an empty list, not a crash, when the manifest is malformed JSON (edge case)', async () => {
    stubUseStorage({ getItem: async () => '{not valid json' })
    const { listDockerfiles } = await importRegistry()
    expect(await listDockerfiles()).toEqual([])
    expect(warnSpy).toHaveBeenCalled()
  })
})
