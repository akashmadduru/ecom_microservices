import type { BuildRequestRow } from './types.js'

/**
 * The public API shape for a build request: every column from `build_requests`
 * EXCEPT the two approval-code hash columns, which are never sent to a
 * client (see the REST contract's "minus any hash/secret fields" note).
 */
export type PublicBuildRequest = Omit<
  BuildRequestRow,
  'approval_code_hash' | 'launch_approval_code_hash'
>

export function toPublicBuildRequest(row: BuildRequestRow): PublicBuildRequest {
  const { approval_code_hash: _approvalCodeHash, launch_approval_code_hash: _launchApprovalCodeHash, ...rest } = row
  return rest
}
