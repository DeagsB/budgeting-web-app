'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'

function revalidate() {
  revalidatePath('/shared')
  revalidatePath('/settlements')
  revalidatePath('/transactions')
}

/**
 * Toggle "shared" on a transaction. If no shares exist, create equal-split
 * shares for every other household member (excluding the payer). If any
 * shares exist, delete them all (unshare).
 */
export async function toggleShared(fd: FormData): Promise<void> {
  const transaction_id = String(fd.get('transaction_id') ?? '')
  if (!transaction_id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()

  const { data: tx } = await supabase
    .from('transactions')
    .select('amount_cents, member_id')
    .eq('id', transaction_id)
    .eq('household_id', ctx.householdId)
    .single()
  if (!tx) return

  const { data: existing } = await supabase
    .from('transaction_shares')
    .select('id')
    .eq('transaction_id', transaction_id)

  if ((existing ?? []).length > 0) {
    await supabase.from('transaction_shares').delete().eq('transaction_id', transaction_id)
    revalidate()
    return
  }

  const { data: members } = await supabase
    .from('members')
    .select('id')
    .eq('household_id', ctx.householdId)
    .order('sort_order')

  const memberIds = (members ?? []).map((m) => m.id)
  const payerId = tx.member_id
  const owees = memberIds.filter((id) => id !== payerId)
  if (owees.length === 0) return

  const totalAbs = Math.abs(Number(tx.amount_cents))
  if (totalAbs === 0) return

  const shareCount = payerId ? owees.length + 1 : owees.length
  const base = Math.floor(totalAbs / shareCount)
  const remainder = totalAbs - base * shareCount
  // Payer (if any) absorbs the remainder to keep sums clean; each owee gets `base`.
  // When payer is null, give the remainder to the first owee so shares still sum to total.
  const rows = owees.map((id, idx) => ({
    household_id: ctx.householdId,
    transaction_id,
    member_id: id,
    amount_cents: !payerId && idx === 0 ? base + remainder : base,
  }))

  if (rows.every((r) => r.amount_cents === 0)) return

  await supabase.from('transaction_shares').insert(rows)
  revalidate()
}

/**
 * Replace the full set of shares for a transaction with the rows posted in
 * the form. Keys: `share:<memberId>` = amount in dollars. Zero / empty means
 * no share row for that member.
 */
export async function saveShareOverride(fd: FormData): Promise<void> {
  const transaction_id = String(fd.get('transaction_id') ?? '')
  if (!transaction_id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()

  const { data: tx } = await supabase
    .from('transactions')
    .select('amount_cents, member_id')
    .eq('id', transaction_id)
    .eq('household_id', ctx.householdId)
    .single()
  if (!tx) return

  const totalAbs = Math.abs(Number(tx.amount_cents))

  const rows: { household_id: string; transaction_id: string; member_id: string; amount_cents: number }[] =
    []
  let sum = 0
  for (const [key, value] of fd.entries()) {
    const m = key.match(/^share:([0-9a-f-]+)$/)
    if (!m) continue
    const member_id = m[1]
    if (member_id === tx.member_id) continue // skip payer row if posted
    const cents = parseMoneyToCents(String(value))
    if (cents === null || cents <= 0) continue
    sum += cents
    rows.push({
      household_id: ctx.householdId,
      transaction_id,
      member_id,
      amount_cents: cents,
    })
  }

  if (sum > totalAbs) return // silently reject overshoot; UI should prevent this

  await supabase.from('transaction_shares').delete().eq('transaction_id', transaction_id)
  if (rows.length > 0) await supabase.from('transaction_shares').insert(rows)
  revalidate()
}

export async function clearShares(fd: FormData): Promise<void> {
  const transaction_id = String(fd.get('transaction_id') ?? '')
  if (!transaction_id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase.from('transaction_shares').delete().eq('transaction_id', transaction_id)
  revalidate()
}

/**
 * Share all transactions matching the given (account_id, month) that don't
 * already have shares. Uses the same equal-split logic as toggleShared.
 */
export async function shareAllUnflagged(fd: FormData): Promise<void> {
  const account_id = String(fd.get('account_id') ?? '')
  const month = String(fd.get('month') ?? '')
  if (!account_id || !/^\d{4}-\d{2}-01$/.test(month)) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()

  const nextMonth = new Date(month + 'T00:00:00')
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const nextMonthISO = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

  const [{ data: txs }, { data: members }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, amount_cents, member_id')
      .eq('household_id', ctx.householdId)
      .eq('account_id', account_id)
      .gte('occurred_on', month)
      .lt('occurred_on', nextMonthISO),
    supabase
      .from('members')
      .select('id')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
  ])

  if (!txs || txs.length === 0) return
  const memberIds = (members ?? []).map((m) => m.id)

  const { data: existing } = await supabase
    .from('transaction_shares')
    .select('transaction_id')
    .in(
      'transaction_id',
      txs.map((t) => t.id),
    )
  const alreadyShared = new Set((existing ?? []).map((e) => e.transaction_id))

  const rowsToInsert: {
    household_id: string
    transaction_id: string
    member_id: string
    amount_cents: number
  }[] = []

  for (const t of txs) {
    if (alreadyShared.has(t.id)) continue
    const totalAbs = Math.abs(Number(t.amount_cents))
    if (totalAbs === 0) continue
    const payerId = t.member_id
    const owees = memberIds.filter((id) => id !== payerId)
    if (owees.length === 0) continue
    const shareCount = payerId ? owees.length + 1 : owees.length
    const base = Math.floor(totalAbs / shareCount)
    const remainder = totalAbs - base * shareCount
    owees.forEach((id, idx) => {
      rowsToInsert.push({
        household_id: ctx.householdId,
        transaction_id: t.id,
        member_id: id,
        amount_cents: !payerId && idx === 0 ? base + remainder : base,
      })
    })
  }

  if (rowsToInsert.length === 0) return
  await supabase.from('transaction_shares').insert(rowsToInsert)
  revalidate()
}

export async function unshareAll(fd: FormData): Promise<void> {
  const account_id = String(fd.get('account_id') ?? '')
  const month = String(fd.get('month') ?? '')
  if (!account_id || !/^\d{4}-\d{2}-01$/.test(month)) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  const nextMonth = new Date(month + 'T00:00:00')
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const nextMonthISO = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

  const { data: txs } = await supabase
    .from('transactions')
    .select('id')
    .eq('household_id', ctx.householdId)
    .eq('account_id', account_id)
    .gte('occurred_on', month)
    .lt('occurred_on', nextMonthISO)

  if (!txs || txs.length === 0) return

  await supabase
    .from('transaction_shares')
    .delete()
    .in(
      'transaction_id',
      txs.map((t) => t.id),
    )

  revalidate()
}
