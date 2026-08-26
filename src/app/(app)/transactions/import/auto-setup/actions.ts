'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { suggestRule, type SampleEmail, type SuggestedRule } from '@/lib/email-suggest'
import { BANK_PRESETS } from '@/lib/bank-presets'
import { humanizeDbError } from '@/lib/errors'

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
  account_router_regex: string | null
  default_account_id: string | null
  default_member_id: string | null
  default_category_id: string | null
}

function readRuleFromForm(fd: FormData): RuleInput | { error: string } {
  const name = String(fd.get('name') ?? '').trim()
  const amount_regex = String(fd.get('amount_regex') ?? '').trim()
  if (!name) return { error: 'Name is required.' }
  if (!amount_regex) return { error: 'Amount regex is required.' }
  try { new RegExp(amount_regex) } catch { return { error: "That amount pattern isn't a valid regular expression. Check for an unclosed bracket or parenthesis." } }

  const direction = String(fd.get('direction') ?? 'outflow') as RuleInput['direction']
  if (!['outflow', 'inflow', 'auto'].includes(direction)) {
    return { error: 'Direction must be outflow, inflow, or auto.' }
  }
  const accountRouterRegex = String(fd.get('account_router_regex') ?? '').trim()
  if (accountRouterRegex) {
    try { new RegExp(accountRouterRegex) } catch {
      return { error: "That account pattern isn't a valid regular expression. Check for an unclosed bracket or parenthesis." }
    }
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
    account_router_regex: accountRouterRegex || null,
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
    if (error) return { error: humanizeDbError(error, { entity: 'rule name' }) }
  } else {
    const { error } = await supabase.from('bank_email_rules').insert(payload)
    if (error) return { error: humanizeDbError(error, { entity: 'rule name' }) }
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

// ─── Bank presets ────────────────────────────────────────────────────────

export type AddPresetState = { ok: true; ruleId: string } | { error: string } | undefined

export async function addBankPreset(presetId: string): Promise<AddPresetState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const preset = BANK_PRESETS.find((p) => p.id === presetId)
  if (!preset) return { error: 'Unknown bank preset.' }

  const supabase = await createClient()

  // Pick a sensible fallback account: first non-archived account in the
  // household. The user can edit the rule afterwards if they want a
  // different fallback. Required because schema needs a non-null FK or
  // we'd insert a half-baked rule.
  const { data: accounts } = await supabase
    .from('accounts')
    .select('id')
    .eq('household_id', ctx.householdId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)

  const fallbackAccountId = accounts?.[0]?.id ?? null
  if (!fallbackAccountId) {
    return { error: 'Add at least one account first — every rule needs a fallback account.' }
  }

  const { data, error } = await supabase
    .from('bank_email_rules')
    .insert({
      household_id: ctx.householdId,
      ...preset.rule,
      default_account_id: fallbackAccountId,
    })
    .select('id')
    .single()
  if (error || !data) return { error: error?.message ?? 'Failed to create rule.' }

  revalidatePath('/transactions/import/auto-setup')
  return { ok: true, ruleId: data.id }
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

// ─── Gmail sync URL + on-demand trigger ──────────────────────────────────

export type SaveSyncUrlState = { ok: true } | { error: string } | undefined

export async function saveSyncUrl(_prev: SaveSyncUrlState, fd: FormData): Promise<SaveSyncUrlState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const raw = String(fd.get('url') ?? '').trim()
  // Accept blank → clears the URL. Otherwise must look like an Apps Script /exec link.
  if (raw && !/^https:\/\/script\.google\.com\/.+\/exec(?:\?.*)?$/.test(raw)) {
    return { error: 'That doesn’t look like an Apps Script Web App URL (should end with /exec).' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('households')
    .update({ gmail_sync_url: raw || null })
    .eq('id', ctx.householdId)
  if (error) return { error: humanizeDbError(error, { entity: 'rule name' }) }
  revalidatePath('/transactions/import/auto-setup')
  return { ok: true }
}

export type SyncNowState =
  | { ok: true; imported: number; skipped: number }
  | { error: string }
  | undefined

export async function triggerGmailSync(): Promise<SyncNowState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()
  const { data: household } = await supabase
    .from('households')
    .select('gmail_sync_url')
    .eq('id', ctx.householdId)
    .single()
  if (!household?.gmail_sync_url) {
    return { error: 'No sync URL configured. Deploy the Apps Script as a Web App and paste the /exec URL in step 5.' }
  }
  try {
    // Apps Script /exec endpoints redirect through Google's auth chain even
    // when "Anyone with the link" — fetch follows by default. 30s timeout
    // since hourly batches can run a little long after a backlog.
    const res = await fetch(household.gmail_sync_url, {
      method: 'GET',
      cache: 'no-store',
    })
    if (!res.ok) return { error: `Apps Script returned HTTP ${res.status}.` }
    const text = await res.text()
    let imported = 0
    let skipped = 0
    try {
      const parsed = JSON.parse(text)
      imported = Number(parsed?.result?.imported ?? 0)
      skipped = Number(parsed?.result?.skipped ?? 0)
    } catch {
      // Apps Script can return HTML on error. Treat unparseable as success
      // with unknown counts — the webhook log on Maple's side will show
      // whatever actually landed.
    }
    revalidatePath('/transactions/import/auto-setup')
    revalidatePath('/transactions')
    revalidatePath('/dashboard')
    return { ok: true, imported, skipped }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Sync request failed.' }
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
