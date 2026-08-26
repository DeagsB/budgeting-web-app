'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'
import { normalizeMerchant } from '@/lib/statement-reconcile'
import { applyRulesToTransactions, recentTransactionIds } from '@/lib/transaction-rules-apply'
import type { RuleDirection, ShareMode } from '@/lib/transaction-rules'
import { humanizeDbError } from '@/lib/errors'
import { addMonthsISO, todayISO } from '@/lib/dates'

export type SaveRuleState =
  | { ok: true; ruleId: string; applied?: { shared: number; categorized: number; skippedManual: number } }
  | { error: string }
  | undefined

export type SimpleState = { ok: true } | { error: string } | undefined
export type PreviewState =
  | { ok: true; matched: number; shared: number; categorized: number; settled: number; paymentPrompts: number }
  | { error: string }
  | undefined
export type ApplyState = { ok: true; shared: number; categorized: number; skippedManual: number } | { error: string } | undefined

const RETRO_MONTHS = 12
const RETRO_CAP = 5000

function revalidate() {
  revalidatePath('/rules')
  revalidatePath('/shared')
  revalidatePath('/transactions')
  revalidatePath('/budgets')
  revalidatePath('/dashboard')
}

function sinceISO(): string {
  return addMonthsISO(todayISO(), -RETRO_MONTHS)
}

type ParsedRule = {
  name: string
  match_text: string
  amount_min_cents: number | null
  amount_max_cents: number | null
  account_id: string | null
  direction: RuleDirection
  share_mode: ShareMode
  share_weights: Record<string, number> | null
  category_id: string | null
  is_settlement: boolean
}

/** Parse + validate the rule sheet. Weights are checked against active members. */
async function parseRule(
  supabase: Awaited<ReturnType<typeof createClient>>,
  householdId: string,
  fd: FormData,
): Promise<ParsedRule | { error: string }> {
  const match_text = String(fd.get('match_text') ?? '').trim().slice(0, 200)
  if (normalizeMerchant(match_text).length < 2) return { error: 'Enter at least two letters of the merchant name.' }
  const name = (String(fd.get('name') ?? '').trim() || normalizeMerchant(match_text)).slice(0, 80)

  const amountMode = String(fd.get('amount_mode') ?? 'any')
  let amount_min_cents: number | null = null
  let amount_max_cents: number | null = null
  if (amountMode !== 'any') {
    const lo = String(fd.get('amount_min') ?? '').trim()
    const hi = String(fd.get('amount_max') ?? '').trim()
    amount_min_cents = lo ? parseMoneyToCents(lo) : null
    amount_max_cents = hi ? parseMoneyToCents(hi) : null
    if ((lo && amount_min_cents === null) || (hi && amount_max_cents === null)) return { error: 'Amount range must be numbers.' }
    if (amount_min_cents !== null && amount_max_cents !== null && amount_min_cents > amount_max_cents) {
      return { error: 'Minimum amount is above the maximum.' }
    }
  }

  const direction = (['outflow', 'inflow', 'any'] as const).includes(String(fd.get('direction')) as RuleDirection)
    ? (String(fd.get('direction')) as RuleDirection)
    : 'outflow'

  // A settlement rule is a third action: it never shares (a payment between
  // members is not an expense) and needs no category.
  const is_settlement = String(fd.get('is_settlement')) === 'on'
  const share_mode = is_settlement
    ? 'none'
    : (['none', 'household', 'custom'] as const).includes(String(fd.get('share_mode')) as ShareMode)
      ? (String(fd.get('share_mode')) as ShareMode)
      : 'household'

  let share_weights: Record<string, number> | null = null
  if (share_mode === 'custom') {
    const { data: members } = await supabase.from('members').select('id').eq('household_id', householdId).is('archived_at', null)
    const active = new Set((members ?? []).map((m) => m.id as string))
    share_weights = {}
    for (const [key, value] of fd.entries()) {
      const m = key.match(/^weight:([0-9a-f-]+)$/)
      if (!m || !active.has(m[1])) continue
      const w = Math.floor(Number(String(value)))
      if (Number.isFinite(w) && w > 0) share_weights[m[1]] = w
    }
    if (Object.keys(share_weights).length === 0) return { error: 'Give at least one member a weight above zero.' }
  }

  const accountRaw = String(fd.get('account_id') ?? '').trim()
  let account_id: string | null = null
  if (accountRaw) {
    const { data } = await supabase.from('accounts').select('id').eq('id', accountRaw).eq('household_id', householdId).maybeSingle()
    account_id = (data?.id as string | undefined) ?? null
  }

  const categoryRaw = String(fd.get('category_id') ?? '').trim()
  let category_id: string | null = null
  if (categoryRaw) {
    const { data } = await supabase.from('categories').select('id').eq('id', categoryRaw).eq('household_id', householdId).maybeSingle()
    category_id = (data?.id as string | undefined) ?? null
  }

  if (share_mode === 'none' && !category_id && !is_settlement) {
    return { error: 'A rule needs to share, set a category, or mark a payment between members.' }
  }

  return { name, match_text, amount_min_cents, amount_max_cents, account_id, direction, share_mode, share_weights, category_id, is_settlement }
}

export async function saveRule(_prev: SaveRuleState, fd: FormData): Promise<SaveRuleState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()

  const parsed = await parseRule(supabase, ctx.householdId, fd)
  if ('error' in parsed) return parsed

  const id = String(fd.get('id') ?? '').trim()
  let ruleId = id
  if (id) {
    const { error } = await supabase.from('transaction_rules').update(parsed).eq('id', id).eq('household_id', ctx.householdId)
    if (error) return { error: humanizeDbError(error, { entity: 'rule name' }) }
  } else {
    const { data: last } = await supabase
      .from('transaction_rules')
      .select('sort_order')
      .eq('household_id', ctx.householdId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    const { data, error } = await supabase
      .from('transaction_rules')
      .insert({ ...parsed, household_id: ctx.householdId, sort_order: Number(last?.sort_order ?? -1) + 1 })
      .select('id')
      .single()
    if (error || !data) return { error: error?.message ?? 'Could not save the rule.' }
    ruleId = data.id as string
  }

  let applied: { shared: number; categorized: number; skippedManual: number } | undefined
  if (String(fd.get('apply_past')) === 'on') {
    const ids = await recentTransactionIds(supabase, ctx.householdId, sinceISO(), RETRO_CAP)
    const res = await applyRulesToTransactions(supabase, ctx.householdId, ids, { onlyRuleIds: [ruleId] })
    applied = { shared: res.shared, categorized: res.categorized, skippedManual: res.skippedManual }
  }

  revalidate()
  return { ok: true, ruleId, applied }
}

/** Dry-run a draft rule against the last 12 months (for the live preview count). */
export async function previewRule(fd: FormData): Promise<PreviewState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()
  const parsed = await parseRule(supabase, ctx.householdId, fd)
  if ('error' in parsed) return { error: parsed.error }

  const ids = await recentTransactionIds(supabase, ctx.householdId, sinceISO(), RETRO_CAP)
  const draftId = '00000000-0000-0000-0000-00000000dead'
  const res = await applyRulesToTransactions(
    supabase,
    ctx.householdId,
    ids,
    { dryRun: true, onlyRuleIds: [draftId] },
    {
      rules: [{ ...parsed, id: draftId, household_id: ctx.householdId, enabled: true, sort_order: -1 }],
      members: (
        await supabase.from('members').select('id, split_weight').eq('household_id', ctx.householdId).is('archived_at', null).order('sort_order')
      ).data?.map((m) => ({ id: m.id as string, weight: Number(m.split_weight ?? 1) })) ?? [],
    },
  )
  return { ok: true, matched: res.matched, shared: res.shared, categorized: res.categorized, settled: res.settled, paymentPrompts: res.paymentPrompts }
}

export async function applyRuleToExisting(fd: FormData): Promise<ApplyState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const id = String(fd.get('id') ?? '')
  if (!id) return { error: "Couldn't save that. Refresh and try again." }
  const supabase = await createClient()
  const ids = await recentTransactionIds(supabase, ctx.householdId, sinceISO(), RETRO_CAP)
  const res = await applyRulesToTransactions(supabase, ctx.householdId, ids, { onlyRuleIds: [id] })
  revalidate()
  return { ok: true, shared: res.shared, categorized: res.categorized, skippedManual: res.skippedManual }
}

export async function toggleRuleEnabled(fd: FormData): Promise<SimpleState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const id = String(fd.get('id') ?? '')
  const enabled = String(fd.get('enabled')) === 'true'
  if (!id) return { error: "Couldn't save that. Refresh and try again." }
  const supabase = await createClient()
  const { error } = await supabase.from('transaction_rules').update({ enabled }).eq('id', id).eq('household_id', ctx.householdId)
  if (error) return { error: humanizeDbError(error, { entity: 'rule name' }) }
  revalidate()
  return { ok: true }
}

export async function reorderRule(fd: FormData): Promise<SimpleState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const id = String(fd.get('id') ?? '')
  const dir = String(fd.get('direction')) === 'up' ? -1 : 1
  if (!id) return { error: "Couldn't save that. Refresh and try again." }
  const supabase = await createClient()
  const { data: rules } = await supabase
    .from('transaction_rules')
    .select('id, sort_order')
    .eq('household_id', ctx.householdId)
    .order('sort_order')
    .order('id')
  const list = (rules ?? []).map((r) => r.id as string)
  const i = list.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return { ok: true }
  ;[list[i], list[j]] = [list[j], list[i]]
  await Promise.all(list.map((rid, idx) => supabase.from('transaction_rules').update({ sort_order: idx }).eq('id', rid)))
  revalidate()
  return { ok: true }
}

/**
 * Delete a rule. With `unshare=yes`, the shares it created are removed too
 * (manual shares are untouched by definition). Categories it set stay, but
 * lose their rule provenance via the FK's set-null.
 */
export async function deleteRule(fd: FormData): Promise<SimpleState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const id = String(fd.get('id') ?? '')
  if (!id) return { error: "Couldn't save that. Refresh and try again." }
  const supabase = await createClient()
  if (String(fd.get('unshare')) === 'yes') {
    const { error } = await supabase.from('transaction_shares').delete().eq('rule_id', id).eq('household_id', ctx.householdId)
    if (error) return { error: humanizeDbError(error, { entity: 'rule name' }) }
  }
  const { error } = await supabase.from('transaction_rules').delete().eq('id', id).eq('household_id', ctx.householdId)
  if (error) return { error: humanizeDbError(error, { entity: 'rule name' }) }
  revalidate()
  return { ok: true }
}
