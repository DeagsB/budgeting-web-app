import { Resend } from 'resend'

/**
 * App-sent email through Resend. Server-only.
 *
 * Returns `{ error }` instead of throwing so callers can degrade (invites
 * always surface a copyable link whether or not the email went out).
 *
 * Env: RESEND_API_KEY (unset = email disabled), EMAIL_FROM (defaults to the
 * Resend sandbox sender, which only delivers to the Resend account's own
 * address until a domain is verified).
 */

export const DEFAULT_FROM = 'Maple <onboarding@resend.dev>'

export function isEmailConfigured(): boolean {
  return !!process.env.RESEND_API_KEY
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM?.trim() || DEFAULT_FROM
}

export type SendResult = { ok: true; id: string | null } | { ok: false; error: string }

export async function sendEmail(msg: {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY
  if (!key) return { ok: false, error: 'Email sending is not configured on this server.' }

  try {
    const resend = new Resend(key)
    const { data, error } = await resend.emails.send({
      from: emailFrom(),
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
    })
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id ?? null }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not send the email.' }
  }
}
