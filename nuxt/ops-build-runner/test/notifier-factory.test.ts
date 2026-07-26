import { describe, expect, it } from 'vitest'
import type { OpsBuildRunnerConfig } from '../src/config.ts'
import { ServiceUnavailableError } from '../src/errors.ts'
import {
  ApprovalNotifierConfigError,
  createApprovalNotifier,
  createLazyApprovalNotifier,
} from '../src/notifier/factory.ts'
import { ConsoleApprovalNotifier } from '../src/notifier/console-notifier.ts'
import { SlackApprovalNotifier } from '../src/notifier/slack-notifier.ts'

function baseConfig(overrides: Partial<OpsBuildRunnerConfig> = {}): OpsBuildRunnerConfig {
  return {
    buildRunnerToken: 'token',
    databaseUrl: 'postgres://localhost/test',
    migrationDatabaseUrl: 'postgres://localhost/test',
    approvalNotifierMode: 'slack',
    slackWebhookUrl: undefined,
    approvalCodeTtlMinutes: 15,
    port: 4100,
    ...overrides,
  }
}

describe('createApprovalNotifier', () => {
  it('selects console only when explicitly configured', () => {
    const notifier = createApprovalNotifier(baseConfig({ approvalNotifierMode: 'console' }))
    expect(notifier).toBeInstanceOf(ConsoleApprovalNotifier)
  })

  it('selects slack when a webhook URL is configured (the required default mode)', () => {
    const notifier = createApprovalNotifier(
      baseConfig({ approvalNotifierMode: 'slack', slackWebhookUrl: 'https://hooks.slack.example/abc' }),
    )
    expect(notifier).toBeInstanceOf(SlackApprovalNotifier)
  })

  it('fails closed -- refuses to construct a slack notifier with no webhook URL, rather than falling back to console', () => {
    expect(() =>
      createApprovalNotifier(baseConfig({ approvalNotifierMode: 'slack', slackWebhookUrl: undefined })),
    ).toThrow(ApprovalNotifierConfigError)
  })
})

describe('createLazyApprovalNotifier', () => {
  it('surfaces the config error as a 503 ServiceUnavailableError at send-time, not at construction time', async () => {
    const notifier = createLazyApprovalNotifier(() =>
      baseConfig({ approvalNotifierMode: 'slack', slackWebhookUrl: undefined }),
    )

    // Constructing the wrapper itself must not throw -- only calling it does.
    await expect(
      notifier.sendApprovalCode('req-1', 'code', { target: 't', gitRef: 'main', reason: 'r' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError)
  })

  it('re-reads config on every call, so fixing the env takes effect without a restart', async () => {
    const configState: { slackWebhookUrl: string | undefined } = { slackWebhookUrl: undefined }
    const notifier = createLazyApprovalNotifier(() =>
      baseConfig({ approvalNotifierMode: 'slack', slackWebhookUrl: configState.slackWebhookUrl }),
    )

    await expect(
      notifier.sendApprovalCode('req-1', 'code', { target: 't', gitRef: 'main', reason: 'r' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError)

    configState.slackWebhookUrl = 'https://hooks.slack.example/abc'
    // Now it should construct a real SlackApprovalNotifier and attempt the
    // (mocked-away-by-network-failure) fetch -- we only assert it got past
    // config validation, i.e. it no longer throws ApprovalNotifierConfigError
    // -- by checking the rejection is NOT a ServiceUnavailableError with the
    // config-error message.
    const globalFetch = globalThis.fetch
    globalThis.fetch = (async () => ({ ok: true }) as Response) as typeof fetch
    try {
      await expect(
        notifier.sendApprovalCode('req-1', 'code', { target: 't', gitRef: 'main', reason: 'r' }),
      ).resolves.toBeUndefined()
    } finally {
      globalThis.fetch = globalFetch
    }
  })
})
