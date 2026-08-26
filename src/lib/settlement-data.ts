import type { SupabaseClient } from '@supabase/supabase-js'
import type { PeriodLite, SettlementWithPeriod, ShareWithPeriod, TxnLite } from '@/lib/settlement'

/**
 * Everything the period statements need, in three round trips. Works under a
 * member session or the service role. Under a member session the shares are
 * RLS-scoped to transactions the caller can see (own, joint, or shared with
 * them), so in households of three or more, pairs not involving the caller
 * may be partial. The service role sees everything.
 */
export type SettlementData = {
  periods: PeriodLite[]
  openPeriod: PeriodLite | null
  transactions: TxnLite[]
  shares: ShareWithPeriod[]
  settlements: (SettlementWithPeriod & {
    id: string
    note: string | null
    paid_transaction_id: string | null
    received_transaction_id: string | null
  })[]
  closeDay: number
  lastClosedAtISO: string | null
}

export async function loadSettlementData(db: SupabaseClient, householdId: string): Promise<SettlementData> {
  const [{ data: periods }, { data: shares }, { data: settlements }, { data: household }] = await Promise.all([
    db
      .from('settlement_periods')
      .select('id, period_start, period_end, status, closed_at, closed_by, settled_at, balances')
      .eq('household_id', householdId)
      .order('period_start', { ascending: true }),
    db
      .from('transaction_shares')
      .select('transaction_id, member_id, amount_cents, settlement_period_id, transaction:transactions!inner(id, amount_cents, member_id)')
      .eq('household_id', householdId),
    db
      .from('settlements')
      .select('id, from_member_id, to_member_id, amount_cents, settled_on, note, period_id, paid_transaction_id, received_transaction_id')
      .eq('household_id', householdId)
      .order('settled_on', { ascending: false }),
    db.from('households').select('settlement_close_day').eq('id', householdId).maybeSingle(),
  ])

  const periodList: PeriodLite[] = (periods ?? []).map((p) => ({
    id: p.id as string,
    period_start: p.period_start as string,
    period_end: (p.period_end as string | null) ?? null,
    status: p.status as PeriodLite['status'],
  }))

  const txById = new Map<string, TxnLite>()
  const shareList: ShareWithPeriod[] = []
  for (const s of shares ?? []) {
    const t = s.transaction as unknown as { id: string; amount_cents: number; member_id: string | null } | null
    if (!t) continue
    txById.set(t.id, { id: t.id, amount_cents: Number(t.amount_cents), member_id: t.member_id })
    shareList.push({
      transaction_id: s.transaction_id as string,
      member_id: s.member_id as string,
      amount_cents: Number(s.amount_cents),
      settlement_period_id: (s.settlement_period_id as string | null) ?? null,
    })
  }

  let lastClosedAtISO: string | null = null
  for (const p of periods ?? []) {
    const c = p.closed_at as string | null
    if (c && (!lastClosedAtISO || c > lastClosedAtISO)) lastClosedAtISO = c
  }

  return {
    periods: periodList,
    openPeriod: periodList.find((p) => p.status === 'open') ?? null,
    transactions: Array.from(txById.values()),
    shares: shareList,
    settlements: (settlements ?? []).map((s) => ({
      id: s.id as string,
      from_member_id: s.from_member_id as string,
      to_member_id: s.to_member_id as string,
      amount_cents: Number(s.amount_cents),
      settled_on: s.settled_on as string,
      note: (s.note as string | null) ?? null,
      period_id: (s.period_id as string | null) ?? null,
      paid_transaction_id: (s.paid_transaction_id as string | null) ?? null,
      received_transaction_id: (s.received_transaction_id as string | null) ?? null,
    })),
    closeDay: Number(household?.settlement_close_day ?? 28),
    lastClosedAtISO: lastClosedAtISO ? lastClosedAtISO.slice(0, 10) : null,
  }
}
