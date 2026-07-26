import { execFile as execFileCb } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GitCheckoutManager } from '../src/git-checkout.ts'

const execFile = promisify(execFileCb)

/**
 * These tests use a REAL local git repository as the "remote" (a plain
 * directory `git init`'d and committed to on disk) -- no mocking of git
 * itself. GitCheckoutManager only ever talks to git via `execFile`, so a
 * real local repo exercises the exact same code path a real GitHub/GitLab
 * remote would, just over the `file://`-equivalent local-path transport
 * instead of ssh/https.
 */

async function run(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFile('git', args, { cwd })
  return stdout.trim()
}

async function makeRemoteRepo(root: string): Promise<{ remoteDir: string; mainSha: string; featureSha: string }> {
  const remoteDir = path.join(root, 'remote')
  await execFile('git', ['init', '--initial-branch=main', remoteDir])
  await run(remoteDir, ['config', 'user.email', 'test@example.com'])
  await run(remoteDir, ['config', 'user.name', 'Test'])

  await execFile('git', ['commit', '--allow-empty', '-m', 'initial commit'], { cwd: remoteDir })
  const mainSha = await run(remoteDir, ['rev-parse', 'HEAD'])

  await execFile('git', ['checkout', '-b', 'feature'], { cwd: remoteDir })
  await execFile('git', ['commit', '--allow-empty', '-m', 'feature commit, NOT on main'], { cwd: remoteDir })
  const featureSha = await run(remoteDir, ['rev-parse', 'HEAD'])

  await execFile('git', ['checkout', 'main'], { cwd: remoteDir })

  return { remoteDir, mainSha, featureSha }
}

describe('GitCheckoutManager', () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'ops-build-runner-git-checkout-test-'))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it('clones on first fetchLatest, then fetches (not re-clones) on subsequent calls', async () => {
    const { remoteDir } = await makeRemoteRepo(root)
    const manager = new GitCheckoutManager({
      remoteUrl: remoteDir,
      mirrorDir: path.join(root, 'mirror'),
      scratchRootDir: path.join(root, 'scratch'),
    })

    await manager.fetchLatest()
    await manager.fetchLatest() // must not throw re-cloning into a non-empty dir

    const sha = await manager.resolveRef('main')
    expect(sha).toBeTruthy()
  })

  it('resolveRef resolves a branch name to its commit sha', async () => {
    const { remoteDir, mainSha } = await makeRemoteRepo(root)
    const manager = new GitCheckoutManager({
      remoteUrl: remoteDir,
      mirrorDir: path.join(root, 'mirror'),
      scratchRootDir: path.join(root, 'scratch'),
    })

    await manager.fetchLatest()
    expect(await manager.resolveRef('main')).toBe(mainSha)
  })

  it('resolveRef returns null for a ref that does not exist', async () => {
    const { remoteDir } = await makeRemoteRepo(root)
    const manager = new GitCheckoutManager({
      remoteUrl: remoteDir,
      mirrorDir: path.join(root, 'mirror'),
      scratchRootDir: path.join(root, 'scratch'),
    })

    await manager.fetchLatest()
    expect(await manager.resolveRef('does-not-exist-anywhere')).toBeNull()
  })

  it('resolveRef rejects a ref shaped like a flag, without ever invoking git on it', async () => {
    const { remoteDir } = await makeRemoteRepo(root)
    const manager = new GitCheckoutManager({
      remoteUrl: remoteDir,
      mirrorDir: path.join(root, 'mirror'),
      scratchRootDir: path.join(root, 'scratch'),
    })

    await manager.fetchLatest()
    await expect(manager.resolveRef('--upload-pack=/bin/sh')).rejects.toThrow(/Refusing to use/)
  })

  it('isAncestorOfMain is true for main\'s own tip and false for a sibling branch commit', async () => {
    const { remoteDir, mainSha, featureSha } = await makeRemoteRepo(root)
    const manager = new GitCheckoutManager({
      remoteUrl: remoteDir,
      mirrorDir: path.join(root, 'mirror'),
      scratchRootDir: path.join(root, 'scratch'),
    })

    await manager.fetchLatest()
    expect(await manager.isAncestorOfMain(mainSha)).toBe(true)
    expect(await manager.isAncestorOfMain(featureSha)).toBe(false)
  })

  it('isAncestorOfMain throws (does not silently return false) for a sha that does not exist at all', async () => {
    const { remoteDir } = await makeRemoteRepo(root)
    const manager = new GitCheckoutManager({
      remoteUrl: remoteDir,
      mirrorDir: path.join(root, 'mirror'),
      scratchRootDir: path.join(root, 'scratch'),
    })

    await manager.fetchLatest()
    await expect(manager.isAncestorOfMain('a'.repeat(40))).rejects.toThrow(/exited unexpectedly/)
  })

  it('prepareBuildContext checks out a fresh worktree, and two builds never share one', async () => {
    const { remoteDir, mainSha } = await makeRemoteRepo(root)
    const manager = new GitCheckoutManager({
      remoteUrl: remoteDir,
      mirrorDir: path.join(root, 'mirror'),
      scratchRootDir: path.join(root, 'scratch'),
    })
    await manager.fetchLatest()

    const contextA = await manager.prepareBuildContext(mainSha, '.')
    const contextB = await manager.prepareBuildContext(mainSha, '.')

    expect(contextA).not.toBe(contextB)
    // Both worktrees are real, independent checkouts of the same commit.
    const headA = await run(contextA, ['rev-parse', 'HEAD'])
    const headB = await run(contextB, ['rev-parse', 'HEAD'])
    expect(headA).toBe(mainSha)
    expect(headB).toBe(mainSha)

    await manager.cleanupBuildContext(contextA)
    await manager.cleanupBuildContext(contextB)
  })

  it('prepareBuildContext returns a subdirectory of the worktree for a non-"." buildContext', async () => {
    const remoteDir = path.join(root, 'remote')
    await execFile('git', ['init', '--initial-branch=main', remoteDir])
    await run(remoteDir, ['config', 'user.email', 'test@example.com'])
    await run(remoteDir, ['config', 'user.name', 'Test'])
    const { mkdir, writeFile } = await import('node:fs/promises')
    await mkdir(path.join(remoteDir, 'vue', 'apps', 'ecom-admin'), { recursive: true })
    await writeFile(path.join(remoteDir, 'vue', 'apps', 'ecom-admin', 'Dockerfile'), 'FROM scratch\n')
    await execFile('git', ['add', '.'], { cwd: remoteDir })
    await execFile('git', ['commit', '-m', 'add ecom-admin dockerfile'], { cwd: remoteDir })
    const sha = await run(remoteDir, ['rev-parse', 'HEAD'])

    const manager = new GitCheckoutManager({
      remoteUrl: remoteDir,
      mirrorDir: path.join(root, 'mirror'),
      scratchRootDir: path.join(root, 'scratch'),
    })
    await manager.fetchLatest()

    const contextDir = await manager.prepareBuildContext(sha, 'vue')
    expect(contextDir.endsWith(`${path.sep}vue`)).toBe(true)
    const dockerfile = await readFile(path.join(contextDir, 'apps', 'ecom-admin', 'Dockerfile'), 'utf8')
    expect(dockerfile).toContain('FROM scratch')

    await manager.cleanupBuildContext(contextDir)
  })
})
