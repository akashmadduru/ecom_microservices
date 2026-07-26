import type { OpsBuildRunnerConfig } from '../config.js'
import { ServiceUnavailableError } from '../errors.js'
import { ConsoleApprovalNotifier } from './console-notifier.js'
import { SlackApprovalNotifier } from './slack-notifier.js'
import type { ApprovalNotifier, ApprovalNotifierContext } from './types.js'

/**
 * Thrown when the configured notifier mode cannot actually be constructed
 * (e.g. "slack" selected but SLACK_WEBHOOK_URL unset). Callers must treat
 * this as a fail-closed condition: refuse to issue an approval code at all,
 * never fall back to a different notifier silently.
 */
export class ApprovalNotifierConfigError extends Error {}

export function createApprovalNotifier(config: OpsBuildRunnerConfig): ApprovalNotifier {
  if (config.approvalNotifierMode === 'console') {
    return new ConsoleApprovalNotifier()
  }

  if (!config.slackWebhookUrl) {
    throw new ApprovalNotifierConfigError(
      'APPROVAL_NOTIFIER is "slack" (the required default) but SLACK_WEBHOOK_URL is unset. ' +
        'Refusing to issue approval codes rather than silently falling back to console logging.',
    )
  }

  return new SlackApprovalNotifier(config.slackWebhookUrl)
}

/**
 * Wraps `createApprovalNotifier` so misconfiguration fails closed PER
 * ACTION, not at process boot -- mirroring how `BUILD_RUNNER_TOKEN` being
 * unset fails closed per-request (503) rather than crashing the whole
 * process. This means `GET /build-requests/:id` and `GET /audit` keep
 * working even if `SLACK_WEBHOOK_URL` is misconfigured; only actions that
 * actually need to issue a fresh approval code (create / launch-request) are
 * affected. Config is re-read on every call (see config.ts), so fixing the
 * env var takes effect without a restart.
 */
export function createLazyApprovalNotifier(getConfig: () => OpsBuildRunnerConfig): ApprovalNotifier {
  return {
    async sendApprovalCode(
      requestId: string,
      code: string,
      context: ApprovalNotifierContext,
    ): Promise<void> {
      let notifier: ApprovalNotifier
      try {
        notifier = createApprovalNotifier(getConfig())
      } catch (err) {
        if (err instanceof ApprovalNotifierConfigError) {
          throw new ServiceUnavailableError(err.message)
        }
        throw err
      }
      await notifier.sendApprovalCode(requestId, code, context)
    },
  }
}
