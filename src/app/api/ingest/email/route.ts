import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { parseEmail, type IngestEmail, type IngestRule } from '@/lib/email-ingest'
import {
  notifyTransactionInserted,
  notifyUnmatchedAlert,
  notifyBudgetOverspendIfCrossed,
} from '@/lib/push'

// POST /api/ingest/email
//
// Body (JSON):
//   {
//     "secret":     "<household.email_ingest_secret>",
//     "from":       "alerts@rbc.com",
//     "subject":    "Debit transaction notification",
//     "body":       "...full text body of the email...",
//     "message_id": "<unique-message-id@gmail>",
//     "received_at": "2026-04-24T19:42:11Z"   // ISO; optional, defaults to now
//   }
//
// Response: 200 with { status: 'inserted'|'duplicate'|'no_match'|... } so the
// Apps Script caller can decide whether to mark the thread as processed.
//
// Auth: the `secret` body field is matched against households.email_ingest_secret.
// No user session is involved — the route uses the Supabase service-role key
// (which bypasses RLS), so it MUST live behind that secret check.

export async function POST(request: NextRequest) {
  const service = createServiceClient()
  if (!service) {
    return NextResponse.json(
      { status: 'error', error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' },
      { status: 503 },
    )
  }

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ status: 'error', error: 'Body must be JSON.' }, { status: 400 })
  }

  const secret = typeof payload.secret === 'string' ? payload.secret : null
  if (!secret) {
    return NextResponse.json({ status: 'invalid_secret' }, { status: 401 })
  }

  const { data: household } = await service
    .from('households')
    .select('id')
    .eq('email_ingest_secret', secret)
    .maybeSingle()

  if (!household) {
    // Don't log to email_ingestion_log — we have no household to attach it to.
    return NextResponse.json({ status: 'invalid_secret' }, { status: 401 })
  }

  const householdId = household.id as string
  const email: IngestEmail = {
    from: String(payload.from ?? ''),
    subject: String(payload.subject ?? ''),
    body: String(payload.body ?? ''),
    message_id: String(payload.message_id ?? '') || `unknown-${Date.now()}`,
    received_at:
      typeof payload.received_at === 'string' && payload.received_at
        ? payload.received_at
        : new Date().toISOString(),
  }
  const rawExcerpt = email.body.slice(0, 500)

  const [{ data: ruleRows }, { data: accountRows }] = await Promise.all([
    service
      .from('bank_email_rules')
      .select(
        'id, name, enabled, match_from, match_subject, amount_regex, description_regex, date_regex, direction, inflow_regex, account_router_regex, default_account_id, default_member_id, default_category_id',
      )
      .eq('household_id', householdId)
      .order('sort_order', { ascending: true }),
    service
      .from('accounts')
      .select('id, last_four, name, ownership, member_id')
      .eq('household_id', householdId)
      .is('archived_at', null),
  ])

  const rules = (ruleRows ?? []) as IngestRule[]
  const accounts = (accountRows ?? []) as {
    id: string
    last_four: string | null
    name: string | null
    ownership: 'member' | 'shared'
    member_id: string | null
  }[]
  const outcome = parseEmail(rules, email, accounts)

  if (!outcome.ok) {
    await service.from('email_ingestion_log').insert({
      household_id: householdId,
      from_address: email.from,
      subject: email.subject,
      message_id: email.message_id,
      status: outcome.reason,
      error_detail: outcome.detail ?? null,
      matched_rule_id: outcome.matched_rule_id ?? null,
      raw_excerpt: rawExcerpt,
    })
    if (outcome.reason === 'no_match') {
      await notifyUnmatchedAlert(householdId, { from: email.from, subject: email.subject })
    }
    return NextResponse.json({ status: outcome.reason }, { status: 200 })
  }

  const { tx } = outcome
  if (!tx.account_id) {
    await service.from('email_ingestion_log').insert({
      household_id: householdId,
      from_address: email.from,
      subject: email.subject,
      message_id: email.message_id,
      status: 'parse_error',
      error_detail: 'Matched rule has no default_account_id; transaction needs an account.',
      matched_rule_id: tx.matched_rule_id,
      raw_excerpt: rawExcerpt,
    })
    return NextResponse.json({ status: 'parse_error' }, { status: 200 })
  }

  // Insert transaction; rely on the (household_id, external_id) unique index
  // to dedup re-deliveries.
  const { data: inserted, error: insertError } = await service
    .from('transactions')
    .insert({
      household_id: householdId,
      account_id: tx.account_id,
      member_id: tx.member_id,
      occurred_on: tx.occurred_on,
      amount_cents: tx.amount_cents,
      description: tx.description,
      source: 'email_alert',
      external_id: tx.external_id,
    })
    .select('id')
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      await service.from('email_ingestion_log').insert({
        household_id: householdId,
        from_address: email.from,
        subject: email.subject,
        message_id: email.message_id,
        status: 'duplicate',
        matched_rule_id: tx.matched_rule_id,
        raw_excerpt: rawExcerpt,
      })
      return NextResponse.json({ status: 'duplicate' }, { status: 200 })
    }
    await service.from('email_ingestion_log').insert({
      household_id: householdId,
      from_address: email.from,
      subject: email.subject,
      message_id: email.message_id,
      status: 'parse_error',
      error_detail: insertError.message,
      matched_rule_id: tx.matched_rule_id,
      raw_excerpt: rawExcerpt,
    })
    return NextResponse.json({ status: 'parse_error', error: insertError.message }, { status: 500 })
  }

  // Single-category split mirrors the manual-add behaviour.
  await service.from('transaction_splits').insert({
    household_id: householdId,
    transaction_id: inserted!.id,
    category_id: tx.category_id,
    amount_cents: tx.amount_cents,
    sort_order: 0,
  })

  await service.from('email_ingestion_log').insert({
    household_id: householdId,
    from_address: email.from,
    subject: email.subject,
    message_id: email.message_id,
    status: 'inserted',
    matched_rule_id: tx.matched_rule_id,
    transaction_id: inserted!.id,
    raw_excerpt: rawExcerpt,
  })

  // Push notifications (best-effort; gated by household prefs).
  const accountName = accounts.find((a) => a.id === tx.account_id)?.name ?? null
  await notifyTransactionInserted(householdId, {
    amountCents: tx.amount_cents,
    accountName,
    description: tx.description,
    ownerMemberId: tx.member_id ?? null,
  })
  await notifyBudgetOverspendIfCrossed(householdId, {
    amountCents: tx.amount_cents,
    categoryId: tx.category_id,
    occurredOn: tx.occurred_on,
  })

  return NextResponse.json({ status: 'inserted', transaction_id: inserted!.id }, { status: 200 })
}
