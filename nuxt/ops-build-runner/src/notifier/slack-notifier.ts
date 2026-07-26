import type { ApprovalNotifier, ApprovalNotifierContext } from './types.js'

/**
 * Posts the approval code to a Slack incoming webhook. This is the intended,
 * documented delivery path for the plaintext code -- Slack receiving it is
 * not a leak. What must never happen is this service's OWN database or logs
 * retaining the plaintext after this call returns; callers are responsible
 * for discarding it (see approval-code.ts's doc comment).
 *
 * Uses the platform's global `fetch` (Node >= 18) rather than adding an HTTP
 * client dependency -- a single POST to one fixed URL does not justify one.
 */
export class SlackApprovalNotifier implements ApprovalNotifier {
  constructor(private readonly webhookUrl: string) {}

  async sendApprovalCode(
    requestId: string,
    code: string,
    context: ApprovalNotifierContext,
  ): Promise<void> {
    const text =
      `:construction: *Build approval requested*\n` +
      `> *Request:* \`${requestId}\`\n` +
      `> *Target:* \`${context.target}\`\n` +
      `> *Git ref:* \`${context.gitRef}\`\n` +
      `> *Reason:* ${context.reason}\n` +
      `> *Approval code:* \`${code}\`\n` +
      `Approve via \`POST /build-requests/${requestId}/approve\` with this code.`

    const response = await fetch(this.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })

    if (!response.ok) {
      // Never include the plaintext code in the thrown error -- callers may
      // log this message (see build-request-service.ts's audit trail).
      throw new Error(
        `SlackApprovalNotifier: webhook responded ${response.status} ${response.statusText}`,
      )
    }
  }
}
