import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
  CountryCode,
  Products,
} from 'plaid'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { getPlaidEnv } from '@/lib/env'

/**
 * Server-only Plaid helpers. Mirrors src/lib/supabase/service.ts: returns null
 * when the integration isn't configured so callers can degrade gracefully
 * (the connect UI shows a "Plaid isn't set up" banner instead of crashing).
 *
 * Never import this from a Client Component — it reads server secrets and the
 * Plaid access token never leaves the server.
 */

/** Build a Plaid API client, or null if PLAID_CLIENT_ID / PLAID_SECRET unset. */
export function createPlaidClient(): PlaidApi | null {
  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!clientId || !secret) return null

  // Resolved (and validated) centrally so an unset/misspelled PLAID_ENV can
  // never silently point production at the sandbox API.
  const basePath = PlaidEnvironments[getPlaidEnv()]

  return new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': clientId,
          'PLAID-SECRET': secret,
        },
      },
    }),
  )
}

/** Canada only — the app's market. */
export function plaidCountryCodes(): CountryCode[] {
  return [CountryCode.Ca]
}

/** Transactions is the only product we use (merchant-rich txn sync). */
export function plaidProducts(): Products[] {
  return [Products.Transactions]
}

// ─── Money: Plaid amount → Maple cents ────────────────────────────────────
//
// Maple convention: amount_cents is signed, POSITIVE = outflow (money leaving
// the account). Plaid convention is identical: a positive `amount` is money
// leaving the account (debit/purchase), negative is money in (refund/deposit).
// So there is NO sign flip — this is the single highest-risk line in the
// integration, isolated here behind one tested helper.
export function plaidAmountToCents(amount: number): number {
  if (!Number.isFinite(amount)) throw new Error(`Non-finite Plaid amount: ${amount}`)
  return Math.round(amount * 100)
}

// ─── Access-token encryption at rest (AES-256-GCM) ────────────────────────
//
// Stored ciphertext = base64( iv(12) || authTag(16) || ciphertext ). The key
// is PLAID_TOKEN_KEY (base64, 32 bytes). Even a DB dump without the env key
// yields only ciphertext. Tokens are decrypted only in server-only code that
// already holds the service-role client.

function tokenKey(): Buffer {
  const raw = process.env.PLAID_TOKEN_KEY
  if (!raw) throw new Error('PLAID_TOKEN_KEY is not configured.')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error('PLAID_TOKEN_KEY must be 32 bytes (base64-encoded).')
  }
  return key
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', tokenKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64')
}

export function decryptToken(blob: string): string {
  const buf = Buffer.from(blob, 'base64')
  const iv = buf.subarray(0, 12)
  const authTag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', tokenKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
