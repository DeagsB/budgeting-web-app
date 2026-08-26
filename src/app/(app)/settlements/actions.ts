'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'
import { computeBalancesByPeriod, computePeriodStatement } from '@/lib/settlement'
import { loadSettlementData } from '@/lib/settlement-data'
import { closePeriod } from '@/lib/settlement-close'
import { todayISO } from '@/lib/dates'
import { humanizeDbError } from '@/lib/errors'

export type SettlementState = { error: string } | { ok: true } | undefined

function revalidate() {
  revalidatePath('/settlements')
  revalidatePath('/shared')
  revalidatePath('/dashboard')
}

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
 * period (recomputed live, not from the snapshot) and mark it settled.
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
