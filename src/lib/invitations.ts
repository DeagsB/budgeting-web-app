import { createHash, randomBytes } from 'node:crypto'

/**
 * Pure helpers for household invitations. The raw token lives only in the
 * emailed link; the database stores `hashInviteToken(raw)`, which must equal
 * the SQL `hash_invite_token()` (sha256 hex of the UTF-8 bytes).
 */

export const INVITE_TTL_DAYS = 7

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashInviteToken(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex')
}

export function inviteExpiry(now = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000)
}

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export function invitationStatus(
  row: { accepted_at: string | null; revoked_at: string | null; expires_at: string },
  now = new Date(),
): InviteStatus {
  if (row.accepted_at) return 'accepted'
  if (row.revoked_at) return 'revoked'
  if (Date.parse(row.expires_at) < now.getTime()) return 'expired'
  return 'pending'
}

export function inviteUrl(siteUrl: string, raw: string): string {
  return `${siteUrl.replace(/\/$/, '')}/invite/${raw}`
}

/** Where Supabase's confirm link should land so the invite resumes. */
export function confirmRedirectFor(siteUrl: string, raw: string): string {
  return `${siteUrl.replace(/\/$/, '')}/auth/confirm?next=${encodeURIComponent(`/invite/${raw}`)}`
}

/**
 * Only same-origin paths survive: must start with a single "/", never "//"
 * or a scheme, no CR/LF. Anything else falls back to /dashboard.
 */
export function safeNextPath(next: string | null | undefined, fallback = '/dashboard'): string {
  if (!next) return fallback
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback
  if (/[\r\n]/.test(next)) return fallback
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(next)) return fallback
  return next
}

/**
 * The invitation token inside a `next` path, if that is what it is. Sign-in
 * and sign-up carry `?next=/invite/<token>` so the account can be created
 * first and the invitation accepted the moment the session exists.
 */
export function inviteTokenFromNext(next: string | null | undefined): string | null {
  if (!next) return null
  const m = /^\/invite\/([A-Za-z0-9_-]{16,})\/?$/.exec(safeNextPath(next, ''))
  return m ? m[1] : null
}

/** Map RPC exception strings to copy the invitee can act on. */
export function acceptErrorMessage(code: string): string {
  const key = code.replace(/^.*?:\s*/, '').trim()
  switch (key) {
    case 'invalid_token':
      return 'This invitation link is not valid.'
    case 'already_accepted':
      return 'This invitation has already been used.'
    case 'revoked':
      return 'This invitation was withdrawn. Ask for a new one.'
    case 'expired':
      return 'This invitation has expired. Ask for a new one.'
    case 'email_mismatch':
      return 'This invitation was sent to a different email address. Sign in with that address to accept it.'
    case 'already_in_household':
      return 'This account already belongs to a household with data in it. Sign out and use a different account, or ask the owner to invite that email instead.'
    case 'member_already_linked':
      return 'That member already has a login.'
    case 'not_authenticated':
      return 'Sign in to accept the invitation.'
    default:
      return 'Could not accept the invitation.'
  }
}
