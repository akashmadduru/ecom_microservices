import type { ApprovalNotifier, ApprovalNotifierContext } from './types.js'

/**
 * Local dev/testing only. Logs the plaintext approval code to stdout.
 *
 * NEVER selected by default -- see config.ts's `approvalNotifierMode`: an
 * operator must set `APPROVAL_NOTIFIER=console` explicitly. Left enabled by
 * default, this would let anyone with read access to this service's own logs
 * self-approve a build/launch, silently collapsing the entire two-action
 * approval model this service exists to enforce.
 */
export class ConsoleApprovalNotifier implements ApprovalNotifier {
  async sendApprovalCode(
    requestId: string,
    code: string,
    context: ApprovalNotifierContext,
  ): Promise<void> {
    console.log(
      JSON.stringify({
        event: 'ops-build-runner.approval-code.console-notifier',
        note: 'LOCAL DEV/TEST ONLY -- this code would be private to Slack in "slack" mode',
        requestId,
        target: context.target,
        gitRef: context.gitRef,
        reason: context.reason,
        code,
      }),
    )
    return Promise.resolve()
  }
}
