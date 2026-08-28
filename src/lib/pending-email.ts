/**
 * The address someone just signed up with, remembered briefly so the
 * "check your inbox" page can offer to resend the confirmation link without
 * putting the email in the URL. Lives in an httpOnly cookie set by the
 * sign-up action and read back by the check-email page and resend action.
 */
export const PENDING_EMAIL_COOKIE = 'maple-pending-email'
export const PENDING_EMAIL_TTL_SECONDS = 30 * 60

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/** Returns a trimmed, lowercased address, or null when the value is unusable. */
export function normalizePendingEmail(raw: string | undefined | null): string | null {
  const v = (raw ?? '').trim().toLowerCase()
  if (!v || v.length > 254 || !EMAIL_RE.test(v)) return null
  return v
}
