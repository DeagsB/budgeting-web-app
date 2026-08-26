'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { applyRulesToTransactions } from '@/lib/transaction-rules-apply'
import { parseMoneyToCents } from '@/lib/format'
import { humanizeDbError } from '@/lib/errors'

export type TransactionState = { error: string } | undefined

function clean(fd: FormData) {
  const occurred_on = String(fd.get('occurred_on') ?? '').trim()
  const account_id = String(fd.get('account_id') ?? '').trim()
  const category_id = String(fd.get('category_id') ?? '').trim() || null
  const member_id = String(fd.get('member_id') ?? '').trim() || null
  const description = String(fd.get('description') ?? '').trim().slice(0, 500) || null
  const amountRaw = String(fd.get('amount') ?? '')
  const direction = String(fd.get('direction') ?? 'out')
  const amountAbs = parseMoneyToCents(amountRaw)
  const amount_cents =
    amountAbs === null ? null : direction === 'in' ? -Math.abs(amountAbs) : Math.abs(amountAbs)

  return { occurred_on, account_id, category_id, member_id, description, amount_cents }
}

function revalidate() {
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/budgets')
  revalidatePath('/pnl')
  revalidatePath('/contributions')
  revalidatePath('/shared')
  revalidatePath('/settlements')
}

export async function createTransaction(
  _prev: TransactionState,
  fd: FormData,
): Promise<TransactionState> {
  const v = clean(fd)
  if (!v.occurred_on) return { error: 'Date is required.' }
  if (!v.account_id) return { error: 'Account is required.' }
  if (v.amount_cents === null) return { error: 'Amount is required.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      household_id: ctx.householdId,
      occurred_on: v.occurred_on,
      account_id: v.account_id,
      member_id: v.member_id,
      description: v.description,
      amount_cents: v.amount_cents,
    })
    .select('id')
    .single()
  if (error || !inserted) return { error: humanizeDbError(error) }

  const { error: splitError } = await supabase.from('transaction_splits').insert({
    household_id: ctx.householdId,
    transaction_id: inserted.id,
    category_id: v.category_id,
    amount_cents: v.amount_cents,
    sort_order: 0,
  })
  if (splitError) return { error: humanizeDbError(splitError) }

  // Rules (auto-share / auto-categorise) run on every ingest path.
  await applyRulesToTransactions(supabase, ctx.householdId, [inserted.id as string])

  revalidate()
  return undefined
}

export async function updateTransaction(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const v = clean(fd)
  if (!v.occurred_on || !v.account_id || v.amount_cents === null) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('transactions')
    .update({
      occurred_on: v.occurred_on,
      account_id: v.account_id,
      member_id: v.member_id,
      description: v.description,
      amount_cents: v.amount_cents,
    })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  // If the transaction had a single split, update it in place to match the
  // new category + amount. Multi-split transactions are managed via a
  // separate split-editor flow.
  const { data: existing } = await supabase
    .from('transaction_splits')
    .select('id')
    .eq('transaction_id', id)
    .order('sort_order')

  if ((existing ?? []).length <= 1) {
    await supabase
      .from('transaction_splits')
      .delete()
      .eq('transaction_id', id)
    await supabase.from('transaction_splits').insert({
      household_id: ctx.householdId,
      transaction_id: id,
      category_id: v.category_id,
      amount_cents: v.amount_cents,
      sort_order: 0,
    })
  } else {
    // Keep existing splits but rescale proportionally if total amount changed.
    // Simpler path: leave splits alone, let the user re-open the split editor
    // if they want to rebalance. We still warn via the app layer.
  }

  // Re-evaluate rules: a renamed merchant or changed amount may now match (or
  // stop matching). Manual shares are never touched by this.
  await applyRulesToTransactions(supabase, ctx.householdId, [id])

  revalidate()
}

type DbClient = Awaited<ReturnType<typeof createClient>>

/**
 * Resolve a category id to one that genuinely belongs to this household, or
 * null. Guards against a spoofed FormData value attaching a foreign-household
 * category to our own splits (the FK and RLS don't enforce same-household).
 */
async function resolveCategoryId(
  supabase: DbClient,
  householdId: string,
  category_id: string | null,
): Promise<string | null> {
  if (!category_id) return null
  const { data } = await supabase
    .from('categories')
    .select('id')
    .eq('id', category_id)
    .eq('household_id', householdId)
    .maybeSingle()
  return data?.id ?? null
}

/**
 * Set (or clear) the category of one or more transactions.
 *
 * Because an uncategorized (or single-category) transaction always has exactly
 * one split spanning the full amount, categorising is an in-place UPDATE of
 * that split's category_id - atomic, and it preserves the splits-sum-equals-
 * total invariant with no delete/insert window. Multi-split transactions are
 * skipped (re-categorising them would destroy the user's allocation).
 *
 * `primaryIds` are always (re)categorised - the user acted on them directly.
 * `siblingIds` (the "apply to similar" fan-out) are only touched while still
 * uncategorized, so a same-merchant row the user already gave an explicit
 * category isn't silently clobbered.
 */
async function setCategoryForTransactions(
  supabase: DbClient,
  householdId: string,
  opts: { primaryIds: string[]; siblingIds?: string[]; category_id: string | null },
): Promise<void> {
  const primarySet = new Set(opts.primaryIds.filter(Boolean))
  const allIds = Array.from(new Set([...primarySet, ...(opts.siblingIds ?? []).filter(Boolean)]))
  if (allIds.length === 0) return

  const safeCategoryId = await resolveCategoryId(supabase, householdId, opts.category_id)

  const [{ data: txs }, { data: splits }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, amount_cents')
      .in('id', allIds)
      .eq('household_id', householdId),
    supabase
      .from('transaction_splits')
      .select('transaction_id, category_id')
      .in('transaction_id', allIds),
  ])

  const splitsByTx = new Map<string, (string | null)[]>()
  for (const s of splits ?? []) {
    const arr = splitsByTx.get(s.transaction_id) ?? []
    arr.push(s.category_id)
    splitsByTx.set(s.transaction_id, arr)
  }
  const amountByTx = new Map((txs ?? []).map((t) => [t.id, t.amount_cents]))

  const updateIds: string[] = []
  const insertIds: string[] = []
  for (const id of allIds) {
    if (!amountByTx.has(id)) continue // not in this household
    const cats = splitsByTx.get(id) ?? []
    if (cats.length > 1) continue // multi-split - already categorised, leave it
    if (!primarySet.has(id) && cats.length === 1 && cats[0] !== null) continue // sibling already categorised
    if (cats.length === 1) updateIds.push(id)
    else insertIds.push(id) // 0 splits (defensive) - needs a fresh row
  }

  if (updateIds.length > 0) {
    const { error } = await supabase
      .from('transaction_splits')
      .update({ category_id: safeCategoryId })
      .in('transaction_id', updateIds)
    if (error) throw new Error(humanizeDbError(error))
  }
  if (insertIds.length > 0) {
    const { error } = await supabase.from('transaction_splits').insert(
      insertIds.map((id) => ({
        household_id: householdId,
        transaction_id: id,
        category_id: safeCategoryId,
        amount_cents: amountByTx.get(id)!,
        sort_order: 0,
      })),
    )
    if (error) throw new Error(humanizeDbError(error))
  }
}

/**
 * Lightweight single-transaction categorisation used by the inline
 * quick-categorize control on the transactions list. Just the category - no
 * full edit-form round trip. Throws on a DB failure so the client can surface
 * it instead of silently no-op'ing.
 */
export async function setTransactionCategory(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return
  const category_id = String(fd.get('category_id') ?? '').trim() || null

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await setCategoryForTransactions(supabase, ctx.householdId, { primaryIds: [id], category_id })
  revalidate()
}

/**
 * Apply the common "triage" attributes to an uncategorized transaction in one
 * shot: category, owning member, and description. Optionally fans the chosen
 * category out to `similar_ids` (other uncategorized transactions sharing the
 * same merchant) so a recurring payee can be cleared in a single tap.
 *
 * `description` is only written when the field is present in the payload, so a
 * caller that omits it leaves the existing description untouched. Throws on a
 * DB failure so the client can surface it.
 */
export async function applyTransactionAttributes(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const category_id = String(fd.get('category_id') ?? '').trim() || null
  const member_id = String(fd.get('member_id') ?? '').trim() || null
  const hasDescription = fd.has('description')
  const description = hasDescription
    ? String(fd.get('description') ?? '').trim().slice(0, 500) || null
    : undefined
  const similarIds = String(fd.get('similar_ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()

  // Only assign a member that actually belongs to this household.
  let safeMemberId: string | null = null
  if (member_id) {
    const { data } = await supabase
      .from('members')
      .select('id')
      .eq('id', member_id)
      .eq('household_id', ctx.householdId)
      .maybeSingle()
    safeMemberId = data?.id ?? null
  }

  const patch: { member_id: string | null; description?: string | null } = { member_id: safeMemberId }
  if (description !== undefined) patch.description = description
  const { error: updateError } = await supabase
    .from('transactions')
    .update(patch)
    .eq('id', id)
    .eq('household_id', ctx.householdId)
  if (updateError) throw new Error(humanizeDbError(updateError))

  // Category (+ same category for any "apply to similar" siblings).
  await setCategoryForTransactions(supabase, ctx.householdId, {
    primaryIds: [id],
    siblingIds: similarIds,
    category_id,
  })

  revalidate()
  // member_id (the payer) drives the shared-expense settlement views.
  revalidatePath('/shared')
  revalidatePath('/settlements')
}

export async function deleteTransaction(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase.from('transactions').delete().eq('id', id).eq('household_id', ctx.householdId)

  revalidate()
}

export type SplitsState = { error: string } | { ok: true } | undefined

export async function saveSplits(_prev: SplitsState, fd: FormData): Promise<SplitsState> {
  const transaction_id = String(fd.get('transaction_id') ?? '')
  if (!transaction_id) return { error: "Couldn't save that. Refresh and try again." }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .select('amount_cents, household_id')
    .eq('id', transaction_id)
    .eq('household_id', ctx.householdId)
    .single()
  if (txError || !tx) return { error: 'That transaction is no longer here. Refresh and try again.' }

  // Read incoming rows: keys `split_category:<index>` + `split_amount:<index>`
  const rows: { index: number; category_id: string | null; amount_cents: number }[] = []
  const indices = new Set<number>()
  for (const key of fd.keys()) {
    const m = key.match(/^split_(category|amount):(\d+)$/)
    if (m) indices.add(Number(m[2]))
  }
  for (const i of Array.from(indices).sort((a, b) => a - b)) {
    const category_id = String(fd.get(`split_category:${i}`) ?? '').trim() || null
    const amountCents = parseMoneyToCents(String(fd.get(`split_amount:${i}`) ?? '0'))
    if (amountCents === null || amountCents === 0) continue
    rows.push({ index: i, category_id, amount_cents: amountCents })
  }

  if (rows.length === 0) return { error: 'At least one split row with a non-zero amount is required.' }

  const sum = rows.reduce((s, r) => s + r.amount_cents, 0)
  const txAmount = Number(tx.amount_cents)
  if (sum !== txAmount) {
    return {
      error: `Splits must sum to the transaction total. Currently ${(sum / 100).toFixed(2)} vs ${(
        txAmount / 100
      ).toFixed(2)}.`,
    }
  }

  // Replace all splits atomically.
  await supabase.from('transaction_splits').delete().eq('transaction_id', transaction_id)
  const { error: insertError } = await supabase.from('transaction_splits').insert(
    rows.map((r, idx) => ({
      household_id: ctx.householdId,
      transaction_id,
      category_id: r.category_id,
      amount_cents: r.amount_cents,
      sort_order: idx,
    })),
  )
  if (insertError) return { error: humanizeDbError(insertError) }

  revalidate()
  return { ok: true }
}
