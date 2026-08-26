'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'
import { splitByWeights, type WeightedMember } from '@/lib/share-split'
import { humanizeDbError } from '@/lib/errors'
import { computeBalancesByPeriod, computePeriodStatement } from '@/lib/settlement'
import { loadSettlementData } from '@/lib/settlement-data'
import { closePeriod } from '@/lib/settlement-close'
import { decide, loadSettlementMatchContext, persistSettlementMatch } from '@/lib/settlement-detect'
import { columnFor, pairFor, sideOf } from '@/lib/settlement-match'
import { applyRulesToTransactions, recentTransactionIds } from '@/lib/transaction-rules-apply'
import { addMonthsISO, todayISO } from '@/lib/dates'

export type ShareActionState = { error: string } | undefined
export type SettlementState = { error: string } | { ok: true } | undefined

function revalidate() {
  revalidatePath('/shared')
  revalidatePath('/transactions')
  revalidatePath('/rules')
  revalidatePath('/dashboard')
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

// ─── Settling up ───────────────────────────────────────────────────────────

/** Record a payment by hand (fallback; the ledger normally does this). */
export async function recordSettlement(_prev: SettlementState, fd: FormData): Promise<SettlementState> {
  const from_member_id = String(fd.get('from_member_id') ?? '')
  const to_member_id = String(fd.get('to_member_id') ?? '')
  const settled_on = String(fd.get('settled_on') ?? '')
  const amount = parseMoneyToCents(String(fd.get('amount') ?? ''))
  const note = String(fd.get('note') ?? '').trim().slice(0, 500) || null
  const periodRaw = String(fd.get('period_id') ?? '').trim()

  if (!from_member_id || !to_member_id) return { error: 'Pick both members.' }
  if (from_member_id === to_member_id) return { error: "Can't settle with yourself." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settled_on)) return { error: 'Invalid date.' }
  if (!amount || amount <= 0) return { error: 'Amount must be positive.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()

  // Attach to the named period if it is ours, else to the open one.
  let period_id: string | null = null
  if (periodRaw) {
    const { data } = await supabase.from('settlement_periods').select('id').eq('id', periodRaw).eq('household_id', ctx.householdId).maybeSingle()
    period_id = (data?.id as string | undefined) ?? null
  }
  if (!period_id) {
    const { data } = await supabase.from('settlement_periods').select('id').eq('household_id', ctx.householdId).eq('status', 'open').maybeSingle()
    period_id = (data?.id as string | undefined) ?? null
  }

  const { error } = await supabase.from('settlements').insert({
    household_id: ctx.householdId,
    from_member_id,
    to_member_id,
    amount_cents: amount,
    settled_on,
    note,
    period_id,
  })
  if (error) return { error: humanizeDbError(error) }

  revalidate()
  return { ok: true }
}

export async function deleteSettlement(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  const { data: row } = await supabase.from('settlements').select('period_id').eq('id', id).eq('household_id', ctx.householdId).maybeSingle()
  await supabase.from('settlements').delete().eq('id', id).eq('household_id', ctx.householdId)
  // A settled period with a payment removed is outstanding again.
  if (row?.period_id) {
    await supabase
      .from('settlement_periods')
      .update({ status: 'closed', settled_at: null })
      .eq('id', row.period_id as string)
      .eq('status', 'settled')
  }
  revalidate()
}

/**
 * "Not a payment" on a settlement the ledger recorded: delete it and mark
 * the ledger rows ignored so detection leaves them alone from now on.
 */
export async function unmatchSettlement(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return
  const ctx = await getHouseholdContext()
  if (!ctx) return
  const supabase = await createClient()
  const { data: row } = await supabase
    .from('settlements')
    .select('period_id, paid_transaction_id, received_transaction_id')
    .eq('id', id)
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (!row) return
  const txIds = [row.paid_transaction_id, row.received_transaction_id].filter((x): x is string => typeof x === 'string')
  if (txIds.length > 0) await supabase.from('transactions').update({ settlement_ignored: true }).in('id', txIds)
  await supabase.from('settlements').delete().eq('id', id).eq('household_id', ctx.householdId)
  if (row.period_id) {
    await supabase
      .from('settlement_periods')
      .update({ status: 'closed', settled_at: null })
      .eq('id', row.period_id as string)
      .eq('status', 'settled')
  }
  revalidate()
}

/** Close the running tally today (ahead of the scheduled close day). */
export async function closePeriodNow(): Promise<SettlementState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()
  try {
    await closePeriod(supabase, { householdId: ctx.householdId, endISO: todayISO(), closedBy: ctx.memberId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    return { error: msg.includes('no_open_period') ? 'There is no open period to close.' : 'Could not close the period. Refresh and try again.' }
  }
  revalidate()
  return { ok: true }
}

/**
 * One-tap settle: record a payment for every outstanding line of a closed
 * period (recomputed live, not from the snapshot) and mark it settled. The
 * ledger rows that evidence these payments link to them when they land.
 */
export async function markPeriodSettled(fd: FormData): Promise<SettlementState> {
  const periodId = String(fd.get('period_id') ?? '')
  if (!periodId) return { error: "Couldn't save that. Refresh and try again." }
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()

  const { data: period } = await supabase
    .from('settlement_periods')
    .select('id, status, period_end')
    .eq('id', periodId)
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (!period) return { error: 'Period not found.' }
  if (period.status !== 'closed') return { error: 'Only a closed period can be marked settled.' }

  const data = await loadSettlementData(supabase, ctx.householdId)
  const statement = computePeriodStatement(periodId, computeBalancesByPeriod(data), data.periods)
  const label = `Settled period ending ${period.period_end as string}`

  if (statement.lines.length > 0) {
    const { error } = await supabase.from('settlements').insert(
      statement.lines.map((l) => ({
        household_id: ctx.householdId,
        from_member_id: l.from_member_id,
        to_member_id: l.to_member_id,
        amount_cents: l.net_cents,
        settled_on: todayISO(),
        note: label,
        period_id: periodId,
      })),
    )
    if (error) return { error: humanizeDbError(error) }
  }

  const { error: upErr } = await supabase
    .from('settlement_periods')
    .update({ status: 'settled', settled_at: new Date().toISOString() })
    .eq('id', periodId)
  if (upErr) return { error: upErr.message }

  revalidate()
  return { ok: true }
}

// ─── Payments detected on the ledger ───────────────────────────────────────

/**
 * "Yes, this is a payment to/from X." Links to an existing settlement when
 * one fits, otherwise records one against the line it pays (exact match) or
 * the open period, for the transaction's full amount.
 */
export async function confirmPaymentCandidate(fd: FormData): Promise<SettlementState> {
  const transaction_id = String(fd.get('transaction_id') ?? '')
  const counterparty = String(fd.get('counterparty_member_id') ?? '')
  if (!transaction_id || !counterparty) return { error: 'Pick who the payment was with.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()

  const [{ data: tx }, { data: cp }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, amount_cents, occurred_on, description, member_id, account:accounts!inner(member_id)')
      .eq('id', transaction_id)
      .eq('household_id', ctx.householdId)
      .maybeSingle(),
    supabase.from('members').select('id').eq('id', counterparty).eq('household_id', ctx.householdId).maybeSingle(),
  ])
  if (!tx) return { error: 'Transaction not found.' }
  if (!cp) return { error: 'That member is not in this household.' }

  const account = tx.account as unknown as { member_id: string | null } | null
  const member = (tx.member_id as string | null) ?? account?.member_id ?? null
  if (!member) return { error: 'This row is on a joint account with no payer, so there is nobody to settle for.' }
  if (member === counterparty) return { error: "Can't settle with yourself." }

  const candidate = {
    transaction_id: tx.id as string,
    member_id: member,
    amount_cents: Number(tx.amount_cents),
    occurred_on: tx.occurred_on as string,
  }
  const sctx = await loadSettlementMatchContext(supabase, ctx.householdId)
  if (sctx.linkedTxIds.has(candidate.transaction_id)) return { error: 'This transaction is already recorded as a payment.' }

  const auto = decide(sctx, candidate)
  const pair = pairFor(candidate, counterparty)
  const note = `Matched from ${(tx.description as string | null) ?? 'the ledger'}`.slice(0, 500)
  const abs = Math.abs(candidate.amount_cents)
  if (abs === 0) return { error: 'A zero-amount row cannot be a payment.' }

  // Respect the automatic decision when it agrees with the chosen counterparty.
  const agrees =
    (auto.kind === 'record' && auto.from_member_id === pair.from_member_id && auto.to_member_id === pair.to_member_id) ||
    (auto.kind === 'link' &&
      sctx.existing.some((s) => s.id === auto.settlement_id && s.from_member_id === pair.from_member_id && s.to_member_id === pair.to_member_id))
  if (auto.kind !== 'prompt' && agrees) {
    const id = await persistSettlementMatch(supabase, ctx.householdId, candidate, auto, sctx, note)
    if (!id) return { error: "Couldn't record that. Refresh and try again." }
    revalidate()
    return { ok: true }
  }

  // Otherwise the person chose: record against the first line for this pair, else the open period.
  const line = sctx.lines.find((l) => l.from_member_id === pair.from_member_id && l.to_member_id === pair.to_member_id)
  const id = await persistSettlementMatch(
    supabase,
    ctx.householdId,
    candidate,
    { kind: 'record', ...pair, period_id: line?.period_id ?? sctx.openPeriodId, column: columnFor(sideOf(candidate.amount_cents)) },
    sctx,
    note,
  )
  if (!id) return { error: "Couldn't record that. Refresh and try again." }
  revalidate()
  return { ok: true }
}

/** "Not a payment": the row stops being offered. Requires edit rights on the row. */
export async function ignorePaymentCandidate(fd: FormData): Promise<SettlementState> {
  const transaction_id = String(fd.get('transaction_id') ?? '')
  if (!transaction_id) return { error: "Couldn't save that. Refresh and try again." }
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .update({ settlement_ignored: true })
    .eq('id', transaction_id)
    .eq('household_id', ctx.householdId)
    .select('id')
  if (error) return { error: humanizeDbError(error) }
  if (!data || data.length === 0) return { error: 'Only the member who owns this row can dismiss it.' }
  revalidate()
  return { ok: true }
}

/** One-tap starter: an INTERAC e-Transfer rule, applied to the last 12 months. */
export async function createStarterSettlementRule(): Promise<SettlementState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()
  const { data: last } = await supabase
    .from('transaction_rules')
    .select('sort_order')
    .eq('household_id', ctx.householdId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await supabase
    .from('transaction_rules')
    .insert({
      household_id: ctx.householdId,
      name: 'e-Transfer between members',
      match_text: 'INTERAC E-TRANSFER',
      direction: 'any',
      share_mode: 'none',
      is_settlement: true,
      sort_order: Number(last?.sort_order ?? -1) + 1,
    })
    .select('id')
    .single()
  if (error || !data) return { error: error ? humanizeDbError(error, { entity: 'rule name' }) : 'Could not create the rule.' }
  const ids = await recentTransactionIds(supabase, ctx.householdId, addMonthsISO(todayISO(), -12), 5000)
  await applyRulesToTransactions(supabase, ctx.householdId, ids, { onlyRuleIds: [data.id as string] })
  revalidate()
  return { ok: true }
}
