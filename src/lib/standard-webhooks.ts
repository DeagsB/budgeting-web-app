import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Standard Webhooks (https://www.standardwebhooks.com) signature check, as
 * used by Supabase Auth HTTP hooks. Small enough to own rather than pull in
 * a dependency for three headers.
 *
 * Signed string: `${webhook-id}.${webhook-timestamp}.${raw body}`, HMAC-SHA256
 * with the base64-decoded secret. The `webhook-signature` header carries one
 * or more space-separated `v1,<base64>` entries (several during rotation).
 */

export const DEFAULT_TOLERANCE_SECONDS = 5 * 60

export type WebhookHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

/** Supabase shows the secret as `v1,whsec_<base64>`; only the base64 part is the key. */
export function decodeWebhookSecret(secret: string): Buffer {
  const trimmed = secret.trim().replace(/^v1,/, '').replace(/^whsec_/, '')
  return Buffer.from(trimmed, 'base64')
}

export function signWebhook(secret: string, id: string, timestamp: string, payload: string): string {
  const mac = createHmac('sha256', decodeWebhookSecret(secret))
  mac.update(`${id}.${timestamp}.${payload}`)
  return `v1,${mac.digest('base64')}`
}

export type VerifyResult = { ok: true } | { ok: false; reason: string }

export function verifyWebhook(
  secret: string,
  headers: WebhookHeaders,
  payload: string,
  now: number = Date.now(),
  toleranceSeconds: number = DEFAULT_TOLERANCE_SECONDS,
): VerifyResult {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) return { ok: false, reason: 'Missing webhook headers.' }

  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return { ok: false, reason: 'Bad webhook timestamp.' }
  if (Math.abs(now / 1000 - ts) > toleranceSeconds) return { ok: false, reason: 'Webhook timestamp outside tolerance.' }

  const expected = Buffer.from(signWebhook(secret, id, timestamp, payload).slice(3), 'base64')
  for (const entry of signature.split(' ')) {
    const [version, value] = entry.split(',')
    if (version !== 'v1' || !value) continue
    const given = Buffer.from(value, 'base64')
    if (given.length === expected.length && timingSafeEqual(given, expected)) return { ok: true }
  }
  return { ok: false, reason: 'Webhook signature mismatch.' }
}
