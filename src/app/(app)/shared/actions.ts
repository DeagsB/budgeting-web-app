'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'
import { splitByWeights, type WeightedMember } from '@/lib/share-split'
import { humanizeDbError } from '@/lib/errors'

export type ShareActionState = { error: string } | undefined

function revalidate() {
  revalidatePath('/shared')
  revalidatePath('/settlements')
  revalidatePath('/transactions')
  revalidatePath('/rules')
}

type Db = Awaited<ReturnType<typeof createClient>>

/** Active members with their household split weight, in display order. */
export async function loadActiveWeightedMembers(db: Db, householdId: string): Promise<WeightedMember[]> {
  const { data } = await db
    .from('members')
    .select('id, split_weight')
    .eq('household_id', householdId)
    .is('archived_at', null)
    .order('sort_order')
  return (data ?? []).map((m) => ({ id: m.id as string, weight: Number(m.split_weight ?? 1) }))
}

/**
 * Toggle "shared" on a transaction. If no shares exist, create shares by the
 * household ratio for every other active member. If any shares exist, delete
 * them all (unshare). Manual shares carry rule_id = null, which also converts
 * a rule-shared transaction into a manual one so rules stop touching it.
 */
export async function toggleShared(fd: FormData): Promise<ShareActionState> {
  const transaction_id = String(fd.get('transaction_id') ?? '')
  if (!transaction_id) return { error: "Couldn't save that. Refresh and try again." }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()

  const { data: tx } = await supabase
    .from('transactions')
    .select('amount_cents, member_id')
    .eq('id', transaction_id)
    .eq('household_id', ctx.householdId)
    .single()
  if (!tx) return { error: 'Transaction not found.' }

  const { data: existing } = await supabase
    .from('transaction_shares')
    .select('id')
    .eq('transaction_id', transaction_id)

  if ((existing ?? []).length > 0) {
    const { error } = await supabase.from('transaction_shares').delete().eq('transaction_id', transaction_id)
    if (error) return { error: humanizeDbError(error) }
    revalidate()
    return undefined
  }

  const members = await loadActiveWeightedMembers(supabase, ctx.householdId)
  const totalAbs = Math.abs(Number(tx.amount_cents))
  if (totalAbs === 0) return { error: 'Nothing to share on a zero-amount transaction.' }

  const rows = splitByWeights(totalAbs, tx.member_id, members)
  if (rows.length === 0) {
    return { error: members.length < 2 ? 'Add another member before sharing.' : 'The household ratio leaves nothing for anyone else to owe.' }
  }

  const { error } = await supabase.from('transaction_shares').insert(
    rows.map((r) => ({
      household_id: ctx.householdId,
      transaction_id,
      member_id: r.member_id,
      amount_cents: r.amount_cents,
      rule_id: null,
    })),
  )
  if (error) return { error: humanizeDbError(error) }
  revalidate()
  return undefined
}

/**
 * Replace the full set of shares for a transaction with the rows posted in
 * the form. Keys: `share:<memberId>` = amount in dollars. Zero / empty means
 * no share row for that member.
 */
export async function saveShareOverride(fd: FormData): Promise<ShareActionState> {
  const transaction_id = String(fd.get('transaction_id') ?? '')
  if (!transaction_id) return { error: "Couldn't save that. Refresh and try again." }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()

  const { data: tx } = await supabase
    .from('transactions')
    .select('amount_cents, member_id')
    .eq('id', transaction_id)
    .eq('household_id', ctx.householdId)
    .single()
  if (!tx) return { error: 'Transaction not found.' }

  const totalAbs = Math.abs(Number(tx.amount_cents))

  const rows: { household_id: string; transaction_id: string; member_id: string; amount_cents: number; rule_id: null }[] = []
  let sum = 0
  for (const [key, value] of fd.entries()) {
    const m = key.match(/^share:([0-9a-f-]+)$/)
    if (!m) continue
    const member_id = m[1]
    if (member_id === tx.member_id) continue // skip payer row if posted
    const cents = parseMoneyToCents(String(value))
    if (cents === null || cents <= 0) continue
    sum += cents
    rows.push({ household_id: ctx.householdId, transaction_id, member_id, amount_cents: cents, rule_id: null })
  }

  if (sum > totalAbs) return { error: 'Shares exceed the transaction total.' }

  const { error: delErr } = await supabase.from('transaction_shares').delete().eq('transaction_id', transaction_id)
  if (delErr) return { error: humanizeDbError(delErr) }
  if (rows.length > 0) {
    const { error } = await supabase.from('transaction_shares').insert(rows)
    if (error) return { error: humanizeDbError(error) }
  }
  revalidate()
  return undefined
}

export async function clearShares(fd: FormData): Promise<ShareActionState> {
  const transaction_id = String(fd.get('transaction_id') ?? '')
  if (!transaction_id) return { error: "Couldn't save that. Refresh and try again." }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { error } = await supabase.from('transaction_shares').delete().eq('transaction_id', transaction_id)
  if (error) return { error: humanizeDbError(error) }
  revalidate()
  return undefined
}

/**
 * Share all transactions matching the given (account_id, month) that don't
 * already have shares, by the household ratio.
 */
export async function shareAllUnflagged(fd: FormData): Promise<ShareActionState> {
  const account_id = String(fd.get('account_id') ?? '')
  const month = String(fd.get('month') ?? '')
  if (!account_id || !/^\d{4}-\d{2}-01$/.test(month)) return { error: 'Missing account or month.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()

  const nextMonth = new Date(month + 'T00:00:00')
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  const nextMonthISO = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

  const [{ data: txs }, members] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, amount_cents, member_id')
      .eq('household_id', ctx.householdId)
      .eq('account_id', account_id)
      .gte('occurred_on', month)
      .lt('occurred_on', nextMonthISO),
    loadActiveWeightedMembers(supabase, ctx.householdId),
  ])

  if (!txs || txs.length === 0) return { error: 'No transactions in that month.' }

  const { data: existing } = await supabase
    .from('transaction_shares')
    .select('transaction_id')
    .in(
      'transaction_id',
      txs.map((t) => t.id),
    )
  const alreadyShared = new Set((existing ?? []).map((e) => e.transaction_id))

  const rowsToInsert: { household_id: string; transaction_id: string; member_id: string; amount_cents: number; rule_id: null }[] = []
  for (const t of txs) {
    if (alreadyShared.has(t.id)) continue
    const totalAbs = Math.abs(Number(t.amount_cents))
    if (totalAbs === 0) continue
    for (const r of splitByWeights(totalAbs, t.member_id, members)) {
      rowsToInsert.push({ household_id: ctx.householdId, transaction_id: t.id, member_id: r.member_id, amount_cents: r.amount_cents, rule_id: null })
    }
  }

  if (rowsToInsert.length === 0) return { error: 'Everything here is already shared.' }
  const { error } = await supabase.from('transaction_shares').insert(rowsToInsert)
  if (error) return { error: humanizeDbError(error) }
  revalidate()
  return undefined
}

export async function unshareAll(fd: FormData): Promise<ShareActionState> {
  const account_id = String(fd.get('account_id') ?? '')
  const month = String(fd.get('month') ?? '')
  if (!account_id || !/^\d{4}-\d{2}-01$/.test(month)) return { error: 'Missing account or month.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

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

  if (!txs || txs.length === 0) return undefined

  const { error } = await supabase
    .from('transaction_shares')
    .delete()
    .in(
      'transaction_id',
      txs.map((t) => t.id),
    )
  if (error) return { error: humanizeDbError(error) }
  revalidate()
  return undefined
}
