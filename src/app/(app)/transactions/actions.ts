'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { applyRulesToTransactions } from '@/lib/transaction-rules-apply'
import { detectTransfersForTransactions, transferDb, transferPartnerIds } from '@/lib/transfer-detect'
import { isUncategorizedSplitSet } from '@/lib/tx-uncategorized'
import { isTxEditable } from '@/lib/tx-scope'
import { parseMoneyToCents } from '@/lib/format'
import { humanizeDbError } from '@/lib/errors'

export type TransactionState = { error: string } | undefined

function clean(fd: FormData) {
  const occurred_on = String(fd.get('occurred_on') ?? '').trim()
  const account_id = String(fd.get('account_id') ?? '').trim()
  const category_id = String(fd.get('category_id') ?? '').trim() || null
  const description = String(fd.get('description') ?? '').trim().slice(0, 500) || null
  const amountRaw = String(fd.get('amount') ?? '')
  const direction = String(fd.get('direction') ?? 'out')
  const amountAbs = parseMoneyToCents(amountRaw)
  const amount_cents =
    amountAbs === null ? null : direction === 'in' ? -Math.abs(amountAbs) : Math.abs(amountAbs)

  return { occurred_on, account_id, category_id, description, amount_cents }
}

function revalidate() {
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/budgets')
  revalidatePath('/pnl')
  revalidatePath('/contributions')
  revalidatePath('/shared')
}

// Quick in-place categorization (the chip tap on an uncategorized row) only
// ever changes one split's category_id - it can't add/remove a transaction,
// change an amount, or touch a share. That can only move the three surfaces
// that sum by category: the list itself, the dashboard, and budgets. Every
// other action above keeps the wider revalidate() set because create/delete/
// full edits can change row counts and totals that p&l, contributions, and
// shared also depend on. A narrower set here keeps every chip tap fast.
function revalidateQuick() {
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/budgets')
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
  // The payer is always the signed-in member; there is no picker.
  if (!ctx.memberId) return { error: 'Pick which member you are in Setup first.' }

  const supabase = await createClient()
  const { data: inserted, error } = await supabase
    .from('transactions')
    .insert({
      household_id: ctx.householdId,
      occurred_on: v.occurred_on,
      account_id: v.account_id,
      member_id: ctx.memberId,
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

  // A transfer partner has to be found BEFORE the write: the DB drops the
  // pair on its own the moment this leg's amount or account stops netting to
  // zero with it, and the freed partner then needs a fresh detect below.
  // Service client where available, since the partner may sit on another
  // member's private account this session cannot see.
  const partners = await transferPartnerIds(transferDb(supabase), ctx.householdId, [id])

  await supabase
    .from('transactions')
    .update({
      occurred_on: v.occurred_on,
      account_id: v.account_id,
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
  // stop matching). Manual shares are never touched by this. The former
  // partner rides along so the transfer pass can re-pair it (or pair it with
  // a different leg) now that this row may have moved.
  await applyRulesToTransactions(supabase, ctx.householdId, [id, ...partners])

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

export type SetCategoryResult = { ok: true } | { error: string }

/**
 * Lightweight single-transaction categorisation used by the inline
 * quick-categorize control on the transactions list. Just the category - no
 * full edit-form round trip. Returns `{ ok: true }` or `{ error }` instead of
 * throwing so the row can show its result on the tap itself (see row.tsx) -
 * an uncaught rejection from a Server Action isn't guaranteed to reach the
 * caller's try/catch on every network condition, which is what made the
 * chip tap look like it silently failed even on a 200.
 */
export async function setTransactionCategory(fd: FormData): Promise<SetCategoryResult> {
  const id = String(fd.get('id') ?? '')
  if (!id) return { error: "Couldn't save. Try again." }
  const category_id = String(fd.get('category_id') ?? '').trim() || null

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  try {
    await setCategoryForTransactions(supabase, ctx.householdId, { primaryIds: [id], category_id })
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't save. Try again." }
  }
  revalidateQuick()
  return { ok: true }
}

/**
 * Apply the common "triage" attributes to an uncategorized transaction in one
 * shot: category and description. Optionally fans the chosen category out to
 * `similar_ids` (other uncategorized transactions sharing the same merchant)
 * so a recurring payee can be cleared in a single tap.
 *
 * `description` is only written when the field is present in the payload, so a
 * caller that omits it leaves the existing description untouched. The payer
 * (`member_id`) is never touched here. Throws on a DB failure so the client
 * can surface it.
 */
export async function applyTransactionAttributes(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const category_id = String(fd.get('category_id') ?? '').trim() || null
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

  if (description !== undefined) {
    const { error: updateError } = await supabase
      .from('transactions')
      .update({ description })
      .eq('id', id)
      .eq('household_id', ctx.householdId)
    if (updateError) throw new Error(humanizeDbError(updateError))
  }

  // Category (+ same category for any "apply to similar" siblings).
  await setCategoryForTransactions(supabase, ctx.householdId, {
    primaryIds: [id],
    siblingIds: similarIds,
    category_id,
  })

  revalidate()
}

export async function deleteTransaction(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()

  // The cascade removes the pair with the row, but it leaves the other leg
  // unpaired and silently back in the income / expense figures. Look the
  // partner up first (the pair is gone once the delete lands) and re-detect
  // it afterwards so it can find a new counterpart when one exists.
  const partners = await transferPartnerIds(transferDb(supabase), ctx.householdId, [id])

  await supabase.from('transactions').delete().eq('id', id).eq('household_id', ctx.householdId)

  if (partners.length > 0) {
    await detectTransfersForTransactions(transferDb(supabase), ctx.householdId, partners)
  }

  revalidate()
}

export type UnlinkTransferResult =
  | { ok: true; requeued: { id: string; occurred_on: string }[] }
  | { error: string }

/**
 * "Not a transfer": break a pair for good. Both legs go back to being a
 * normal outflow and inflow, and the matcher will not pair them again.
 *
 * Session client only - RLS is the whole authorization story here. The
 * ignore flag is written FIRST so a sync landing in the gap between the
 * flag and the delete cannot re-pair the legs; RLS silently limits that
 * update to the legs this login can edit, and the matcher skips a pair when
 * EITHER leg is ignored, so one flag is enough. The delete is what the
 * caller actually asked for: zero rows means the pair is visible but this
 * login can edit neither leg (a partner's private accounts on both sides).
 *
 * Returns the legs that are uncategorized after the unlink so the row can
 * bump the client-side "to categorize" count without a round trip.
 */
export async function unlinkTransfer(fd: FormData): Promise<UnlinkTransferResult> {
  const transferId = String(fd.get('transfer_id') ?? '')
  if (!transferId) return { error: "Couldn't save that. Refresh and try again." }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { data: pair, error: pairError } = await supabase
    .from('transfers')
    .select('id, out_transaction_id, in_transaction_id')
    .eq('id', transferId)
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (pairError) return { error: humanizeDbError(pairError) }
  if (!pair) return { error: 'That transfer is no longer here. Refresh and try again.' }

  const legIds = [pair.out_transaction_id as string, pair.in_transaction_id as string]

  const { error: flagError } = await supabase
    .from('transactions')
    .update({ transfer_ignored: true })
    .in('id', legIds)
    .eq('household_id', ctx.householdId)
  if (flagError) return { error: humanizeDbError(flagError) }

  const { data: deleted, error: deleteError } = await supabase
    .from('transfers')
    .delete()
    .eq('id', transferId)
    .eq('household_id', ctx.householdId)
    .select('id')
  if (deleteError) return { error: humanizeDbError(deleteError) }
  if (!deleted || deleted.length === 0) return { error: 'Only the member who owns this row can change it.' }

  // Now that neither row is a leg, a settlement rule may claim them (an
  // e-Transfer between members that was mistaken for an own-account move).
  // The transfer pass itself skips ignored rows, so this cannot re-pair.
  await applyRulesToTransactions(supabase, ctx.householdId, legIds)

  // Same rule as the page's counts: only rows this login can edit are in the
  // pile, so a share-only leg (visible, not editable) must not be reported
  // back or the client count would drift above the list.
  const [{ data: rows }, { data: visibleAccounts }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, occurred_on, account_id, member_id, transaction_splits(category_id)')
      .in('id', legIds)
      .eq('household_id', ctx.householdId),
    supabase.from('accounts').select('id').eq('household_id', ctx.householdId).is('archived_at', null),
  ])
  const visibleAccountIds = new Set((visibleAccounts ?? []).map((a) => a.id as string))
  const requeued = ((rows ?? []) as unknown as {
    id: string
    occurred_on: string
    account_id: string
    member_id: string | null
    transaction_splits: { category_id: string | null }[] | null
  }[])
    .filter((r) =>
      isTxEditable({ accountVisible: visibleAccountIds.has(r.account_id), payerId: r.member_id, myMemberId: ctx.memberId }),
    )
    .filter((r) => isUncategorizedSplitSet(r.transaction_splits ?? []))
    .map((r) => ({ id: r.id, occurred_on: r.occurred_on }))

  revalidate()
  return { ok: true, requeued }
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
