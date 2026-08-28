import { esc, renderEmail } from './email/layout'
import { authEmailContent, type AuthEmailKind } from './email/templates'

/**
 * Turn a Supabase "Send Email" hook payload into the message(s) to send.
 * Pure - the route handler does the signature check and the sending.
 *
 * Links go straight to our /auth/confirm with `token_hash` + `type`, the
 * same query the route already accepts, instead of bouncing through
 * supabase.co/auth/v1/verify. `redirect_to` is whatever the app passed as
 * emailRedirectTo (already `<site>/auth/confirm[?next=...]`); when it is
 * missing we fall back to the project's site URL.
 */

export type SendEmailHookPayload = {
  user: {
    id?: string
    email?: string | null
    new_email?: string | null
  }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: string
    site_url: string
    token_new?: string
    token_hash_new?: string
    old_email?: string
  }
}

export type OutgoingAuthEmail = { to: string; subject: string; html: string; text: string }

/** Supabase action types → our template kinds + the `type` /auth/confirm verifies with. */
const KINDS: Record<string, { kind: AuthEmailKind; otpType: string }> = {
  signup: { kind: 'signup', otpType: 'signup' },
  magiclink: { kind: 'magiclink', otpType: 'magiclink' },
  recovery: { kind: 'recovery', otpType: 'recovery' },
  invite: { kind: 'invite', otpType: 'invite' },
  email_change: { kind: 'email_change', otpType: 'email_change' },
  // Re-sent confirmation for an unconfirmed account uses the signup template.
  email: { kind: 'signup', otpType: 'email' },
}

export function confirmLink(redirectTo: string, siteUrl: string, tokenHash: string, otpType: string): string {
  let url: URL
  try {
    url = new URL(redirectTo || `${siteUrl.replace(/\/$/, '')}/auth/confirm`)
  } catch {
    url = new URL(`${siteUrl.replace(/\/$/, '')}/auth/confirm`)
  }
  if (!url.pathname.startsWith('/auth/confirm')) url.pathname = '/auth/confirm'
  url.searchParams.set('token_hash', tokenHash)
  url.searchParams.set('type', otpType)
  return url.toString()
}

export function buildAuthEmails(p: SendEmailHookPayload): { emails: OutgoingAuthEmail[] } | { error: string } {
  const d = p.email_data
  const entry = KINDS[d.email_action_type]
  if (!entry) return { error: `Unsupported email_action_type "${d.email_action_type}".` }
  const to = (p.user.email ?? '').trim()
  if (!to) return { error: 'Payload has no recipient email.' }

  const emails: OutgoingAuthEmail[] = []
  const render = (recipient: string, tokenHash: string, token: string) => {
    const content = authEmailContent(entry.kind, {
      url: confirmLink(d.redirect_to, d.site_url, tokenHash, entry.otpType),
      token,
      email: esc(to),
      newEmail: esc(p.user.new_email ?? ''),
    })
    const r = renderEmail(content)
    emails.push({ to: recipient, subject: r.subject, html: r.html, text: r.text })
  }

  render(to, d.token_hash, d.token)

  // Secure email change: the new address gets its own token so both sides
  // confirm. Supabase hands us both in one call.
  if (entry.kind === 'email_change' && d.token_hash_new && p.user.new_email) {
    render(p.user.new_email, d.token_hash_new, d.token_new ?? '')
  }

  return { emails }
}
