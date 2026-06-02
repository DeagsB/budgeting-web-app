import { NextResponse, type NextRequest } from 'next/server'
import { createHash } from 'node:crypto'
import { importJWK, jwtVerify, decodeProtectedHeader, type JWK } from 'jose'
import { createServiceClient } from '@/lib/supabase/service'
import { createPlaidClient } from '@/lib/plaid'
import { syncPlaidItem } from '@/lib/plaid-sync'

// POST /api/plaid/webhook
//
// Plaid posts here when an item's transactions change (SYNC_UPDATES_AVAILABLE)
// or its login expires (ITEM_LOGIN_REQUIRED). Authenticity is verified via the
// `Plaid-Verification` JWT (ES256) against Plaid's webhook verification key and
// a SHA-256 of the raw body — BEFORE any field is trusted. The route then runs
// the same sync routine the manual/cron paths use. Always 200s quickly so Plaid
// doesn't retry; a rejected signature returns 401.

// Verify the Plaid-Verification JWT. Returns true if the request is authentic.
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
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  const service = createServiceClient()
  if (!service) {
    return NextResponse.json({ status: 'error', error: 'Missing SUPABASE_SERVICE_ROLE_KEY.' }, { status: 503 })
  }

  const rawBody = await request.text()
  const verHeader = request.headers.get('plaid-verification')
  const env = (process.env.PLAID_ENV ?? 'sandbox').toLowerCase()

  // Production: a valid signature is mandatory. Sandbox `fire_webhook` calls are
  // unsigned, so allow them there (test data only) to enable verification.
  if (verHeader) {
    const ok = await verifyPlaid(verHeader, rawBody)
    if (!ok) {
      await service.from('plaid_sync_log').insert({ household_id: null, item_id: null, status: 'webhook_rejected', error_detail: 'Signature verification failed.' })
      return NextResponse.json({ status: 'rejected' }, { status: 401 })
    }
  } else if (env !== 'sandbox') {
    await service.from('plaid_sync_log').insert({ household_id: null, item_id: null, status: 'webhook_rejected', error_detail: 'Missing Plaid-Verification header.' })
    return NextResponse.json({ status: 'rejected' }, { status: 401 })
  }

  let body: { webhook_type?: string; webhook_code?: string; item_id?: string }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ status: 'bad_request' }, { status: 400 })
  }

  const { webhook_type, webhook_code, item_id } = body
  if (!item_id) return NextResponse.json({ status: 'ignored' }, { status: 200 })

  const { data: item } = await service
    .from('plaid_items')
    .select('id, household_id, item_id, cursor')
    .eq('item_id', item_id)
    .maybeSingle()
  if (!item) return NextResponse.json({ status: 'unknown_item' }, { status: 200 })

  const itemRow = {
    id: item.id as string,
    household_id: item.household_id as string,
    item_id: item.item_id as string,
    cursor: (item.cursor as string | null) ?? null,
  }

  // Login expired → flag for re-auth; don't try to sync.
  if (webhook_type === 'ITEM' && (webhook_code === 'ERROR' || webhook_code === 'PENDING_EXPIRATION')) {
    await service.from('plaid_items').update({ status: 'login_required' }).eq('id', itemRow.id)
    return NextResponse.json({ status: 'login_required' }, { status: 200 })
  }

  const SYNC_CODES = new Set(['SYNC_UPDATES_AVAILABLE', 'INITIAL_UPDATE', 'HISTORICAL_UPDATE', 'DEFAULT_UPDATE'])
  if (webhook_type === 'TRANSACTIONS' && webhook_code && SYNC_CODES.has(webhook_code)) {
    const plaid = createPlaidClient()
    if (!plaid) return NextResponse.json({ status: 'plaid_unconfigured' }, { status: 200 })
    const res = await syncPlaidItem(service, plaid, itemRow)
    return NextResponse.json({ status: res.status, added: res.added, reconciled: res.reconciled }, { status: 200 })
  }

  return NextResponse.json({ status: 'ignored' }, { status: 200 })
}
