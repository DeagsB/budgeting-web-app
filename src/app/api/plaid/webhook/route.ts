import { NextResponse, type NextRequest } from 'next/server'
import { after } from 'next/server'
import { createHash } from 'node:crypto'
import { importJWK, jwtVerify, decodeProtectedHeader, type JWK } from 'jose'
import { createServiceClient } from '@/lib/supabase/service'
import { createPlaidClient } from '@/lib/plaid'
import { getPlaidEnv } from '@/lib/env'
import { syncPlaidItem } from '@/lib/plaid-sync'

// POST /api/plaid/webhook
//
// Plaid posts here when an item's transactions change or its connection state
// changes. Authenticity is verified via the `Plaid-Verification` JWT (ES256)
// against Plaid's webhook verification key and a SHA-256 of the raw body -
// BEFORE any field is trusted. Signature is mandatory outside sandbox; an
// unset PLAID_ENV resolves to production (see src/lib/env.ts), so a missing
// variable fails closed.
//
// Transaction syncs run in `after()` so Plaid gets its 200 immediately and
// does not retry a long historical pull. `maxDuration` bounds that background
// work; the daily cron picks up anything that did not finish.

export const maxDuration = 60

const SYNC_CODES = new Set([
  'SYNC_UPDATES_AVAILABLE',
  'INITIAL_UPDATE',
  'HISTORICAL_UPDATE',
  'DEFAULT_UPDATE',
  'TRANSACTIONS_REMOVED',
])

async function verifyPlaid(token: string, rawBody: string): Promise<boolean> {
  const plaid = createPlaidClient()
  if (!plaid) return false
  try {
    const { kid } = decodeProtectedHeader(token)
    if (!kid) return false
    const keyResp = await plaid.webhookVerificationKeyGet({ key_id: kid })
    const key = await importJWK(keyResp.data.key as unknown as JWK, 'ES256')
    const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'], maxTokenAge: '5 min' })
    const expected = createHash('sha256').update(rawBody, 'utf8').digest('hex')
    return payload.request_body_sha256 === expected
  } catch (e) {
    console.error('[plaid-webhook] signature check threw', e instanceof Error ? e.message : e)
    return false
  }
}

export async function POST(request: NextRequest) {
  const service = createServiceClient()
  if (!service) {
    console.error('[plaid-webhook] SUPABASE_SERVICE_ROLE_KEY missing')
    return NextResponse.json({ status: 'error', error: 'Server misconfigured.' }, { status: 503 })
  }

  const rawBody = await request.text()
  const verHeader = request.headers.get('plaid-verification')

  let env: 'sandbox' | 'production'
  try {
    env = getPlaidEnv()
  } catch (e) {
    console.error('[plaid-webhook] PLAID_ENV invalid', e instanceof Error ? e.message : e)
    return NextResponse.json({ status: 'error' }, { status: 503 })
  }

  const reject = async (why: string) => {
    console.error('[plaid-webhook] rejected', { why, env })
    await service.from('plaid_sync_log').insert({
      household_id: null,
      item_id: null,
      status: 'webhook_rejected',
      trigger: 'webhook',
      error_detail: why,
    })
    return NextResponse.json({ status: 'rejected' }, { status: 401 })
  }

  if (verHeader) {
    if (!(await verifyPlaid(verHeader, rawBody))) return reject('Signature verification failed.')
  } else if (env !== 'sandbox') {
    // Sandbox `fire_webhook` calls are unsigned; everywhere else this is mandatory.
    return reject('Missing Plaid-Verification header.')
  }

  let body: { webhook_type?: string; webhook_code?: string; item_id?: string; error?: { error_code?: string } }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ status: 'bad_request' }, { status: 400 })
  }

  const { webhook_type, webhook_code, item_id } = body
  if (!item_id) return NextResponse.json({ status: 'ignored' }, { status: 200 })

  const { data: item } = await service
    .from('plaid_items')
    .select('id, household_id, item_id, cursor, status')
    .eq('item_id', item_id)
    .maybeSingle()
  if (!item) {
    console.warn('[plaid-webhook] unknown item', { item_id, webhook_type, webhook_code })
    return NextResponse.json({ status: 'unknown_item' }, { status: 200 })
  }

  const itemRow = {
    id: item.id as string,
    household_id: item.household_id as string,
    item_id: item.item_id as string,
    cursor: (item.cursor as string | null) ?? null,
  }

  if (webhook_type === 'ITEM') {
    switch (webhook_code) {
      case 'ERROR':
      case 'PENDING_EXPIRATION':
        await service
          .from('plaid_items')
          .update({ status: 'login_required', error_detail: body.error?.error_code ?? webhook_code })
          .eq('id', itemRow.id)
        return NextResponse.json({ status: 'login_required' }, { status: 200 })
      case 'PENDING_DISCONNECT':
        await service
          .from('plaid_items')
          .update({ status: 'pending_disconnect', error_detail: 'PENDING_DISCONNECT' })
          .eq('id', itemRow.id)
        return NextResponse.json({ status: 'pending_disconnect' }, { status: 200 })
      case 'USER_PERMISSION_REVOKED':
      case 'USER_ACCOUNT_REVOKED':
        await service.from('plaid_item_secrets').delete().eq('item_id', itemRow.id)
        await service
          .from('plaid_items')
          .update({ status: 'revoked', error_detail: webhook_code })
          .eq('id', itemRow.id)
        return NextResponse.json({ status: 'revoked' }, { status: 200 })
      case 'NEW_ACCOUNTS_AVAILABLE':
        await service.from('plaid_items').update({ needs_account_review: true }).eq('id', itemRow.id)
        return NextResponse.json({ status: 'needs_account_review' }, { status: 200 })
      case 'LOGIN_REPAIRED':
        await service.from('plaid_items').update({ status: 'active', error_detail: null }).eq('id', itemRow.id)
        return NextResponse.json({ status: 'active' }, { status: 200 })
      default:
        return NextResponse.json({ status: 'ignored' }, { status: 200 })
    }
  }

  if (webhook_type === 'TRANSACTIONS' && webhook_code && SYNC_CODES.has(webhook_code)) {
    if (item.status === 'removed' || item.status === 'revoked') {
      return NextResponse.json({ status: 'ignored', reason: item.status }, { status: 200 })
    }
    const plaid = createPlaidClient()
    if (!plaid) return NextResponse.json({ status: 'plaid_unconfigured' }, { status: 200 })

    after(async () => {
      try {
        const res = await syncPlaidItem(service, plaid, itemRow, { trigger: 'webhook' })
        if (res.status === 'error') console.error('[plaid-webhook] sync error', { item: itemRow.id, error: res.error })
      } catch (e) {
        console.error('[plaid-webhook] sync threw', { item: itemRow.id, e: e instanceof Error ? e.message : e })
      }
    })
    return NextResponse.json({ status: 'queued' }, { status: 200 })
  }

  return NextResponse.json({ status: 'ignored' }, { status: 200 })
}
