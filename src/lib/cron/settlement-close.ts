import type { SupabaseClient } from '@supabase/supabase-js'
import { closeDateForMonth, shouldAutoClose } from '@/lib/settlement'
import { closePeriod } from '@/lib/settlement-close'

export type AutoCloseSummary = { considered: number; closed: number; errors: { household: string; error: string }[] }

/**
 * Close every household whose close day has arrived this month and which
 * has not closed yet this month. One household's failure never blocks the
 * rest; re-running is a no-op thanks to shouldAutoClose.
 */
export async function runSettlementAutoClose(service: SupabaseClient, opts: { todayISO: string }): Promise<AutoCloseSummary> {
  const summary: AutoCloseSummary = { considered: 0, closed: 0, errors: [] }
  const { data: households } = await service.from('households').select('id, settlement_close_day')
  for (const h of households ?? []) {
    summary.considered += 1
    const householdId = h.id as string
    try {
      const { data: last } = await service
        .from('settlement_periods')
        .select('closed_at')
        .eq('household_id', householdId)
        .not('closed_at', 'is', null)
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const lastClosedAtISO = last?.closed_at ? String(last.closed_at).slice(0, 10) : null
      const closeDay = Number(h.settlement_close_day ?? 28)
      if (!shouldAutoClose({ todayISO: opts.todayISO, closeDay, lastClosedAtISO })) continue
      await closePeriod(service, { householdId, endISO: closeDateForMonth(opts.todayISO, closeDay), closedBy: null })
      summary.closed += 1
    } catch (e) {
      summary.errors.push({ household: householdId, error: e instanceof Error ? e.message : String(e) })
      console.error('[cron/settlement-close] failed', { household: householdId, e: e instanceof Error ? e.message : e })
    }
  }
  return summary
}
