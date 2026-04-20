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
  const { error } = await supabase.from('transactions').insert({
    household_id: ctx.householdId,
    occurred_on: v.occurred_on,
    account_id: v.account_id,
    category_id: v.category_id,
    member_id: v.member_id,
    description: v.description,
    amount_cents: v.amount_cents,
  })
  if (error) return { error: error.message }

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/budgets')
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
      category_id: v.category_id,
      member_id: v.member_id,
      description: v.description,
      amount_cents: v.amount_cents,
    })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/budgets')
}

export async function deleteTransaction(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase.from('transactions').delete().eq('id', id).eq('household_id', ctx.householdId)

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/budgets')
}
