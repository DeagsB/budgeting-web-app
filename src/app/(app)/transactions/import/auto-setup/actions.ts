'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { suggestRule, type SampleEmail, type SuggestedRule } from '@/lib/email-suggest'

export type RotateSecretState =
  | { ok: true; secret: string }
  | { error: string }
  | undefined

export async function rotateSecret(): Promise<RotateSecretState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('rotate_email_ingest_secret', {
    h_id: ctx.householdId,
  })
  if (error || !data) return { error: error?.message ?? 'Failed to rotate secret.' }
  revalidatePath('/transactions/import/auto-setup')
  return { ok: true, secret: String(data) }
}

export type RuleFormState = { error: string } | { ok: true } | undefined

type RuleInput = {
  id?: string
  name: string
  enabled: boolean
  match_from: string | null
  match_subject: string | null
  amount_regex: string
  description_regex: string | null
  date_regex: string | null
  direction: 'outflow' | 'inflow' | 'auto'
  inflow_regex: string | null
  default_account_id: string | null
  default_member_id: string | null
  default_category_id: string | null
}

function readRuleFromForm(fd: FormData): RuleInput | { error: string } {
  const name = String(fd.get('name') ?? '').trim()
  const amount_regex = String(fd.get('amount_regex') ?? '').trim()
  if (!name) return { error: 'Name is required.' }
  if (!amount_regex) return { error: 'Amount regex is required.' }
  try { new RegExp(amount_regex) } catch { return { error: 'Amount regex is invalid.' } }

  const direction = String(fd.get('direction') ?? 'outflow') as RuleInput['direction']
  if (!['outflow', 'inflow', 'auto'].includes(direction)) {
    return { error: 'Direction must be outflow, inflow, or auto.' }
  }
  const idRaw = fd.get('id')
  return {
    id: typeof idRaw === 'string' && idRaw ? idRaw : undefined,
    name,
    enabled: fd.get('enabled') === 'on',
    match_from: (String(fd.get('match_from') ?? '').trim() || null),
    match_subject: (String(fd.get('match_subject') ?? '').trim() || null),
    amount_regex,
    description_regex: (String(fd.get('description_regex') ?? '').trim() || null),
    date_regex: (String(fd.get('date_regex') ?? '').trim() || null),
    direction,
    inflow_regex: (String(fd.get('inflow_regex') ?? '').trim() || null),
    default_account_id: (String(fd.get('default_account_id') ?? '').trim() || null),
    default_member_id: (String(fd.get('default_member_id') ?? '').trim() || null),
    default_category_id: (String(fd.get('default_category_id') ?? '').trim() || null),
  }
}

export async function saveRule(_prev: RuleFormState, fd: FormData): Promise<RuleFormState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const parsed = readRuleFromForm(fd)
  if ('error' in parsed) return parsed

  const supabase = await createClient()
  const row = { ...parsed, household_id: ctx.householdId }
  const { id, ...payload } = row

  if (id) {
    const { error } = await supabase
      .from('bank_email_rules')
      .update(payload)
      .eq('id', id)
      .eq('household_id', ctx.householdId)
    if (error) return { error: error.message }
  } else {
    const { error } = await supabase.from('bank_email_rules').insert(payload)
    if (error) return { error: error.message }
  }
  revalidatePath('/transactions/import/auto-setup')
  return { ok: true }
}

export async function deleteRule(formData: FormData): Promise<void> {
  const ctx = await getHouseholdContext()
  if (!ctx) return
  const id = String(formData.get('id') ?? '')
  if (!id) return
  const supabase = await createClient()
  await supabase
    .from('bank_email_rules')
    .delete()
    .eq('id', id)
    .eq('household_id', ctx.householdId)
  revalidatePath('/transactions/import/auto-setup')
}

// ─── Smart suggester ─────────────────────────────────────────────────────

export async function suggestFromSample(sample: SampleEmail): Promise<SuggestedRule> {
  // Pure heuristic; no DB or auth needed beyond the user being signed in
  // (the page itself gates access). Server-side keeps the regex library on
  // one canonical implementation rather than duplicated to the client.
  return suggestRule(sample)
}

// ─── Test email ──────────────────────────────────────────────────────────

export type TestEmailState =
  | { ok: true; status: string; transaction_id?: string }
  | { error: string }
  | undefined

export async function sendTestEmail(): Promise<TestEmailState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { data: household } = await supabase
    .from('households')
    .select('email_ingest_secret')
    .eq('id', ctx.householdId)
    .single()
  if (!household?.email_ingest_secret) {
    return { error: 'Generate a webhook secret in step 1 first.' }
  }

  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (!host) return { error: 'Could not determine the webhook URL.' }
  const webhookUrl = `${proto}://${host}/api/ingest/email`

  // Synthetic alert designed to match the "generic transaction" starter
  // template *and* most user-suggested rules: dollar amount, "at MERCHANT",
  // unambiguous outflow language.
  const stamp = Date.now()
  const payload = {
    secret: household.email_ingest_secret,
    from: 'maple-test@maple.local',
    subject: 'Maple test — purchase notification',
    body:
      'This is a Maple test email.\n' +
      `A debit transaction of $4.20 was processed at MAPLE TEST MERCHANT on ${new Date().toISOString().slice(0, 10)}.\n` +
      'No action required.\n',
    message_id: `maple-test-${stamp}@maple.local`,
    received_at: new Date().toISOString(),
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as {
      status?: string
      error?: string
      transaction_id?: string
    }
    // Treat HTTP failure or an explicit `error` status as a failure even
    // though the webhook responded — the user wants to know it didn't work.
    if (!res.ok || json.status === 'error') {
      const baseMessage = json.error ?? `Webhook returned HTTP ${res.status}.`
      const hint =
        res.status === 503
          ? ' Make sure SUPABASE_SERVICE_ROLE_KEY is set on this environment (Vercel → Project Settings → Environment Variables) and redeploy.'
          : ''
      return { error: baseMessage + hint }
    }
    revalidatePath('/transactions/import/auto-setup')
    return {
      ok: true,
      status: json.status ?? 'unknown',
      transaction_id: json.transaction_id,
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Test request failed.' }
  }
}

// ─── Live log poll ───────────────────────────────────────────────────────

export type LogEntry = {
  id: string
  received_at: string
  from_address: string | null
  subject: string | null
  status: string
  error_detail: string | null
  transaction_id: string | null
}

export async function getRecentLog(): Promise<LogEntry[]> {
  const ctx = await getHouseholdContext()
  if (!ctx) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('email_ingestion_log')
    .select('id, received_at, from_address, subject, status, error_detail, transaction_id')
    .eq('household_id', ctx.householdId)
    .order('received_at', { ascending: false })
    .limit(15)
  return (data ?? []) as LogEntry[]
}
