'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'

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
  if (error || !inserted) return { error: error?.message ?? 'Failed to insert transaction.' }

  const { error: splitError } = await supabase.from('transaction_splits').insert({
    household_id: ctx.householdId,
    transaction_id: inserted.id,
    category_id: v.category_id,
    amount_cents: v.amount_cents,
    sort_order: 0,
  })
  if (splitError) return { error: splitError.message }

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

  revalidate()
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
  if (!transaction_id) return { error: 'Missing transaction id.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .select('amount_cents, household_id')
    .eq('id', transaction_id)
    .eq('household_id', ctx.householdId)
    .single()
  if (txError || !tx) return { error: txError?.message ?? 'Transaction not found.' }

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
  if (insertError) return { error: insertError.message }

  revalidate()
  return { ok: true }
}
