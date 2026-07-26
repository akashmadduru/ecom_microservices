/**
 * Builds the `requester_signal` / `approver_signal` / `launch_approver_signal`
 * value: source IP + request timestamp, and NOTHING else. This is explicitly
 * NOT an identity -- see migrations/0001_build_requests.sql's column comment.
 * This service, like nuxt/ops-dashboard, authenticates with a single shared
 * bearer token (`BUILD_RUNNER_TOKEN`), so there is no per-operator account to
 * resolve "who" to beyond "someone holding the token, from this address, at
 * this time."
 */
export function buildActorSignal(remoteAddress: string | undefined): string {
  const ip = remoteAddress ?? 'unknown'
  return `${ip}@${new Date().toISOString()}`
}
