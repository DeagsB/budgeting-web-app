import type { SupabaseClient } from '@supabase/supabase-js'
import { computeBalancesByPeriod, computePeriodStatement, type NetBalance, type PeriodStatement } from '@/lib/settlement'
import { loadSettlementData } from '@/lib/settlement-data'
import { sendPushToHousehold, sendPushToUsers } from '@/lib/push'
import { formatMoney } from '@/lib/format'

/**
 * Close the household's open period as of `endISO`, snapshot the statement
 * and notify each member what they owe. Used by the "Close period now"
 * action (session client) and the daily cron (service client).
 */
export async function closePeriod(
  db: SupabaseClient,
  args: { householdId: string; endISO: string; closedBy: string | null; notify?: boolean },
): Promise<{ periodId: string; statement: PeriodStatement }> {
  const { data: closedId, error } = await db.rpc('close_settlement_period', {
    p_household: args.householdId,
    p_end: args.endISO,
    p_closed_by: args.closedBy,
  })
  if (error || !closedId) throw new Error(error?.message ?? 'close_failed')
  const periodId = closedId as string

  const data = await loadSettlementData(db, args.householdId)
  const byPeriod = computeBalancesByPeriod(data)
  const statement = computePeriodStatement(periodId, byPeriod, data.periods)

  await db
    .from('settlement_periods')
    .update({ balances: statement.lines, ...(statement.lines.length === 0 ? { status: 'settled', settled_at: new Date().toISOString() } : {}) })
    .eq('id', periodId)

  if (args.notify !== false) await notifyPeriodClosed(db, args.householdId, periodId, statement.lines)

  return { periodId, statement }
}

/** "You owe X $Y" to each member with a login; household-wide fallback. */
export async function notifyPeriodClosed(db: SupabaseClient, householdId: string, periodId: string, lines: NetBalance[]): Promise<void> {
  const { data: hh } = await db.from('households').select('notification_prefs').eq('id', householdId).maybeSingle()
  const prefs = (hh?.notification_prefs as { settlement_period?: boolean } | null) ?? {}
  if (prefs.settlement_period === false) return

  const { data: members } = await db.from('members').select('id, display_name, user_id').eq('household_id', householdId)
  const name = new Map((members ?? []).map((m) => [m.id as string, m.display_name as string]))
  const userOf = new Map((members ?? []).map((m) => [m.id as string, (m.user_id as string | null) ?? null]))
  const url = `/settlements?period=${periodId}`

  if (lines.length === 0) {
    await sendPushToHousehold(householdId, { title: 'Shared expenses closed', body: 'All square this period. Nothing to settle.', url, tag: `maple-settle-${periodId}` })
    return
  }

  const perMember = new Map<string, string[]>()
  for (const l of lines) {
    ;(perMember.get(l.from_member_id) ?? perMember.set(l.from_member_id, []).get(l.from_member_id)!).push(
      `You owe ${name.get(l.to_member_id) ?? 'a member'} ${formatMoney(l.net_cents)}`,
    )
    ;(perMember.get(l.to_member_id) ?? perMember.set(l.to_member_id, []).get(l.to_member_id)!).push(
      `${name.get(l.from_member_id) ?? 'A member'} owes you ${formatMoney(l.net_cents)}`,
    )
  }

  let sentToSomeone = false
  for (const [memberId, msgs] of perMember) {
    const uid = userOf.get(memberId)
    if (!uid) continue
    sentToSomeone = true
    await sendPushToUsers([uid], { title: 'Time to settle up', body: msgs.join(' · '), url, tag: `maple-settle-${periodId}` })
  }
  if (!sentToSomeone) {
    await sendPushToHousehold(householdId, {
      title: 'Time to settle up',
      body: lines.map((l) => `${name.get(l.from_member_id) ?? 'Member'} owes ${name.get(l.to_member_id) ?? 'Member'} ${formatMoney(l.net_cents)}`).join(' · '),
      url,
      tag: `maple-settle-${periodId}`,
    })
  }
}
