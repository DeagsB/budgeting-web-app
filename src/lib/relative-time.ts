// Human-friendly "time since" phrasing for timestamps shown in the UI (e.g.
// "synced 2 h ago" next to a linked account row). Deterministic given `now`,
// so callers - and tests - never depend on the wall clock.

/**
 * `iso` -> a short relative phrase: "just now", "5 min ago", "2 h ago",
 * "3 d ago". Returns `null` for a missing or unparsable timestamp so callers
 * decide their own copy for that case (e.g. "not synced yet") instead of
 * this module guessing it.
 */
export function relativeTimeFromNow(
  iso: string | null | undefined,
  now: Date = new Date(),
): string | null {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null

  // Clamp negative deltas (clock skew, or a timestamp that is technically in
  // the future) to "just now" rather than printing a nonsensical value.
  const ms = Math.max(0, now.getTime() - then)
  const min = Math.round(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} d ago`
}

/**
 * "synced 2 h ago" / "synced just now" / "never synced" - the phrasing used
 * next to a linked bank connection, shared by the setup page's bank-
 * connections card and the full plaid-setup sync wizard so both read the
 * same way instead of one showing a raw ISO timestamp.
 */
export function formatSyncedAt(iso: string | null | undefined, now: Date = new Date()): string {
  const rel = relativeTimeFromNow(iso, now)
  return rel ? `synced ${rel}` : 'never synced'
}
