import { NextResponse } from 'next/server'
import { buildAuthEmails, type SendEmailHookPayload } from '@/lib/auth-email'
import { sendEmail } from '@/lib/email/send'
import { verifyWebhook } from '@/lib/standard-webhooks'

/**
 * Supabase Auth "Send Email" hook. Supabase POSTs here instead of using SMTP;
 * we render the Maple template and send through the Resend HTTP API - the
 * path that reliably reaches inboxes (mail via the SMTP relay was landing in
 * spam). Configured in the dashboard under Authentication → Auth Hooks with
 * the secret in SEND_EMAIL_HOOK_SECRET.
 *
 * Contract: 200 with an empty JSON object on success; any other status makes
 * Supabase fail the originating request with our message, so sign-ups do not
 * silently create accounts nobody can confirm.
 */
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const secret = process.env.SEND_EMAIL_HOOK_SECRET
  if (!secret) return fail(500, 'SEND_EMAIL_HOOK_SECRET is not configured.')

  const payload = await request.text()
  const verdict = verifyWebhook(
    secret,
    {
      id: request.headers.get('webhook-id'),
      timestamp: request.headers.get('webhook-timestamp'),
      signature: request.headers.get('webhook-signature'),
    },
    payload,
  )
  if (!verdict.ok) return fail(401, verdict.reason)

  let parsed: SendEmailHookPayload
  try {
    parsed = JSON.parse(payload) as SendEmailHookPayload
  } catch {
    return fail(400, 'Malformed hook payload.')
  }
  if (!parsed?.user || !parsed?.email_data) return fail(400, 'Malformed hook payload.')

  const built = buildAuthEmails(parsed)
  if ('error' in built) return fail(400, built.error)

  for (const e of built.emails) {
    const r = await sendEmail(e)
    if (!r.ok) return fail(500, r.error)
  }
  return NextResponse.json({}, { status: 200 })
}

function fail(status: number, message: string) {
  return NextResponse.json({ error: { http_code: status, message } }, { status })
}
