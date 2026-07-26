export interface ApprovalNotifierContext {
  target: string
  gitRef: string
  reason: string
}

/**
 * Pluggable approval-code delivery. Implementations MUST NOT persist or log
 * the plaintext `code` anywhere on this service's own side (Slack itself
 * receiving the plaintext code is the intended delivery path, not a leak).
 */
export interface ApprovalNotifier {
  sendApprovalCode(
    requestId: string,
    code: string,
    context: ApprovalNotifierContext,
  ): Promise<void>
}
