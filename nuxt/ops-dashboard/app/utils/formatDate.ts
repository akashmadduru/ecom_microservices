/**
 * Renders an ISO 8601 timestamp as dd/mm/yyyy HH:MM (24h, zero-padded).
 * Returns '—' for null/undefined AND for any unparseable input — treats both
 * as the same "nothing to show" case, matching this app's existing `?? '—'`
 * convention, rather than throwing on malformed data (kubernetes-mode
 * timestamps are documented approximations elsewhere in this app; this
 * function must never crash a page over one).
 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
