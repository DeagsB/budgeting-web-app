import { describe, expect, it } from 'vitest'
import { decodeWebhookSecret, signWebhook, verifyWebhook } from './standard-webhooks'

const SECRET = 'v1,whsec_' + Buffer.from('a-32-byte-test-secret-for-hmac!!').toString('base64')
const NOW = 1_800_000_000_000
const TS = String(Math.floor(NOW / 1000))
const BODY = '{"user":{"email":"a@b.co"},"email_data":{"token":"123456"}}'

describe('standard webhooks', () => {
  it('decodes the dashboard-format secret to raw bytes', () => {
    expect(decodeWebhookSecret(SECRET).toString()).toBe('a-32-byte-test-secret-for-hmac!!')
    expect(decodeWebhookSecret('whsec_' + Buffer.from('x').toString('base64')).toString()).toBe('x')
  })

  it('accepts a signature it produced', () => {
    const sig = signWebhook(SECRET, 'msg_1', TS, BODY)
    expect(verifyWebhook(SECRET, { id: 'msg_1', timestamp: TS, signature: sig }, BODY, NOW)).toEqual({ ok: true })
  })

  it('accepts when one of several rotated signatures matches', () => {
    const sig = signWebhook(SECRET, 'msg_1', TS, BODY)
    const other = signWebhook('whsec_' + Buffer.from('old-secret').toString('base64'), 'msg_1', TS, BODY)
    const r = verifyWebhook(SECRET, { id: 'msg_1', timestamp: TS, signature: `${other} ${sig}` }, BODY, NOW)
    expect(r.ok).toBe(true)
  })

  it('rejects a tampered body, wrong id, or wrong secret', () => {
    const sig = signWebhook(SECRET, 'msg_1', TS, BODY)
    expect(verifyWebhook(SECRET, { id: 'msg_1', timestamp: TS, signature: sig }, BODY + ' ', NOW).ok).toBe(false)
    expect(verifyWebhook(SECRET, { id: 'msg_2', timestamp: TS, signature: sig }, BODY, NOW).ok).toBe(false)
    expect(verifyWebhook('whsec_' + Buffer.from('nope').toString('base64'), { id: 'msg_1', timestamp: TS, signature: sig }, BODY, NOW).ok).toBe(false)
  })

  it('rejects stale timestamps and missing headers', () => {
    const old = String(Math.floor(NOW / 1000) - 600)
    const sig = signWebhook(SECRET, 'msg_1', old, BODY)
    expect(verifyWebhook(SECRET, { id: 'msg_1', timestamp: old, signature: sig }, BODY, NOW)).toEqual({
      ok: false,
      reason: 'Webhook timestamp outside tolerance.',
    })
    expect(verifyWebhook(SECRET, { id: null, timestamp: TS, signature: sig }, BODY, NOW).ok).toBe(false)
    expect(verifyWebhook(SECRET, { id: 'msg_1', timestamp: 'soon', signature: sig }, BODY, NOW).ok).toBe(false)
  })
})
