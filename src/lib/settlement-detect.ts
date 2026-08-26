import type { SupabaseClient } from '@supabase/supabase-js'
import { computeBalancesByPeriod, computePeriodStatement } from '@/lib/settlement'
import { loadSettlementData, type SettlementData } from '@/lib/settlement-data'
import {
  matchSettlement,
  type LinkableSettlement,
  type OutstandingLine,
  type SettlementCandidate,
  type SettlementMatch,
} from '@/lib/settlement-match'

/**
 * Settlement detection, I/O side. `src/lib/settlement-match.ts` decides;
 * this file loads what it needs and persists what it decided. Used by the
 * rule pipeline (every ingest path) and by the Shared page's confirm action.
 */

export type SettlementMatchContext = {
  /** Awaiting-statement lines first, then the open statement (with carry-forward). */
  lines: OutstandingLine[]
  existing: LinkableSettlement[]
  activeMemberIds: string[]
  openPeriodId: string | null
  closedPeriodIds: Set<string>
  /** Transactions already evidencing a settlement (either side). */
  linkedTxIds: Set<string>
}

export async function loadSettlementMatchContext(db: SupabaseClient, householdId: string): Promise<SettlementMatchContext> {
  const [data, { data: members }] = await Promise.all([
    loadSettlementData(db, householdId),
    db.from('members').select('id').eq('household_id', householdId).is('archived_at', null).order('sort_order'),
  ])
  return buildSettlementMatchContext(data, (members ?? []).map((m) => m.id as string))
}

/** Pure assembly from already-loaded data (the Shared page loads the same data for its statement). */
export function buildSettlementMatchContext(data: SettlementData, activeMemberIds: string[]): SettlementMatchContext {
  const byPeriod = computeBalancesByPeriod(data)
  const lines: OutstandingLine[] = []
  const closedPeriodIds = new Set<string>()
  for (const p of data.periods) {
    if (p.status !== 'closed') continue
    closedPeriodIds.add(p.id)
    for (const l of computePeriodStatement(p.id, byPeriod, data.periods).lines) lines.push({ ...l, period_id: p.id })
  }
  if (data.openPeriod) {
    for (const l of computePeriodStatement(data.openPeriod.id, byPeriod, data.periods).lines) {
      lines.push({ ...l, period_id: data.openPeriod.id })
    }
  }
  const existing: LinkableSettlement[] = data.settlements.map((s) => ({
    id: s.id,
    from_member_id: s.from_member_id,
    to_member_id: s.to_member_id,
    amount_cents: s.amount_cents,
    settled_on: s.settled_on,
    paid_transaction_id: s.paid_transaction_id,
    received_transaction_id: s.received_transaction_id,
  }))
  const linkedTxIds = new Set<string>()
  for (const s of existing) {
    if (s.paid_transaction_id) linkedTxIds.add(s.paid_transaction_id)
    if (s.received_transaction_id) linkedTxIds.add(s.received_transaction_id)
  }
  return {
    lines,
    existing,
    activeMemberIds,
    openPeriodId: data.openPeriod?.id ?? null,
    closedPeriodIds,
    linkedTxIds,
  }
}

/** Decide for one candidate using a loaded context. */
export function decide(ctx: SettlementMatchContext, c: SettlementCandidate): SettlementMatch {
  return matchSettlement(
    c,
    ctx.lines,
    ctx.existing,
    ctx.activeMemberIds.filter((m) => m !== c.member_id),
  )
}

/**
 * Persist a link or record decision and keep the context current so the next
 * candidate in the same batch (typically the other member's side of the same
 * transfer) links instead of recording twice. Returns the settlement id.
 */
export async function persistSettlementMatch(
  db: SupabaseClient,
  householdId: string,
  c: SettlementCandidate,
  m: Extract<SettlementMatch, { kind: 'link' | 'record' }>,
  ctx: SettlementMatchContext,
  note: string,
): Promise<string | null> {
  if (m.kind === 'link') {
    const { error } = await db
      .from('settlements')
      .update({ [m.column]: c.transaction_id })
      .eq('id', m.settlement_id)
      .eq('household_id', householdId)
    if (error) {
      console.error('[settlement] link failed', { tx: c.transaction_id, code: error.code, msg: error.message })
      return null
    }
    const s = ctx.existing.find((x) => x.id === m.settlement_id)
    if (s) s[m.column] = c.transaction_id
    ctx.linkedTxIds.add(c.transaction_id)
    return m.settlement_id
  }

  const abs = Math.abs(c.amount_cents)
  const { data, error } = await db
    .from('settlements')
    .insert({
      household_id: householdId,
      from_member_id: m.from_member_id,
      to_member_id: m.to_member_id,
      amount_cents: abs,
      settled_on: c.occurred_on,
      note,
      period_id: m.period_id,
      [m.column]: c.transaction_id,
    })
    .select('id')
    .single()
  if (error || !data) {
    console.error('[settlement] record failed', { tx: c.transaction_id, code: error?.code, msg: error?.message })
    return null
  }
  const id = data.id as string
  ctx.existing.push({
    id,
    from_member_id: m.from_member_id,
    to_member_id: m.to_member_id,
    amount_cents: abs,
    settled_on: c.occurred_on,
    paid_transaction_id: m.column === 'paid_transaction_id' ? c.transaction_id : null,
    received_transaction_id: m.column === 'received_transaction_id' ? c.transaction_id : null,
  })
  ctx.linkedTxIds.add(c.transaction_id)
  // The line is paid; drop it so a second identical candidate becomes a prompt.
  const i = ctx.lines.findIndex(
    (l) => l.period_id === m.period_id && l.from_member_id === m.from_member_id && l.to_member_id === m.to_member_id && l.net_cents === abs,
  )
  if (i >= 0) ctx.lines.splice(i, 1)

  if (m.period_id && ctx.closedPeriodIds.has(m.period_id)) await settlePeriodIfCovered(db, householdId, m.period_id)
  return id
}

/** Flip a closed period to settled once nothing is outstanding on it (same test "Mark settled" uses). */
export async function settlePeriodIfCovered(db: SupabaseClient, householdId: string, periodId: string): Promise<boolean> {
  const data = await loadSettlementData(db, householdId)
  const period = data.periods.find((p) => p.id === periodId)
  if (!period || period.status !== 'closed') return false
  const st = computePeriodStatement(periodId, computeBalancesByPeriod(data), data.periods)
  if (st.lines.length > 0) return false
  const { error } = await db
    .from('settlement_periods')
    .update({ status: 'settled', settled_at: new Date().toISOString() })
    .eq('id', periodId)
    .eq('status', 'closed')
  return !error
}

/** Owner-of-record for a ledger row: the payer, else the account's owner, else nobody (joint, unattributed). */
export function candidateMember(tx: { member_id: string | null; account_id: string }, accountOwner: Map<string, string | null>): string | null {
  return tx.member_id ?? accountOwner.get(tx.account_id) ?? null
}
