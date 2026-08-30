import type { SupabaseClient } from '@supabase/supabase-js'
import { detectTransfersForHousehold } from '@/lib/transfer-detect'

export type TransferBackfillSummary = {
  considered: number
  backfilled: number
  paired: number
  remaining: number
  errors: { household: string; error: string }[]
}

/**
 * One-time pass over a household's whole ledger so transfers that landed
 * before detection existed get paired too. Oldest households first, within a
 * wall-clock budget; whoever does not fit is picked up next run. The stamp is
 * written only after the household's pass finished, so a crash mid-way costs
 * a retry and nothing else, and the unique leg constraints make that retry a
 * no-op for every pair already recorded. One household's failure never
 * blocks the rest.
 */
export async function runTransferBackfill(
  service: SupabaseClient,
  opts: { budgetMs: number },
): Promise<TransferBackfillSummary> {
  const summary: TransferBackfillSummary = { considered: 0, backfilled: 0, paired: 0, remaining: 0, errors: [] }
  const { data: households, error: listError } = await service
    .from('households')
    .select('id')
    .is('transfers_backfilled_at', null)
    .order('created_at', { ascending: true })
  // A failed listing (the column not migrated yet, a timeout) must read as a
  // failure, not as "every household is already stamped".
  if (listError) {
    summary.errors.push({ household: '*', error: `households list failed (${listError.code ?? '?'}): ${listError.message}` })
    console.error('[cron/transfer-backfill] list failed', { code: listError.code, msg: listError.message })
    return summary
  }
  const rows = households ?? []
  summary.considered = rows.length

  const started = Date.now()
  for (let i = 0; i < rows.length; i++) {
    if (Date.now() - started > opts.budgetMs) {
      summary.remaining = rows.length - i
      break
    }
    const householdId = rows[i].id as string
    try {
      const res = await detectTransfersForHousehold(service, householdId)
      summary.paired += res.paired
      // A pass that could not write every pair is not done: leave the stamp
      // null so tomorrow's run picks the household up again (the pairs that
      // did land are no-ops then, thanks to the unique legs).
      if (res.error) throw new Error(res.error)
      // Filtered on the null stamp so an overlapping run cannot move a stamp
      // another run already wrote.
      const { error } = await service
        .from('households')
        .update({ transfers_backfilled_at: new Date().toISOString() })
        .eq('id', householdId)
        .is('transfers_backfilled_at', null)
      if (error) throw new Error(error.message)
      summary.backfilled += 1
    } catch (e) {
      summary.errors.push({ household: householdId, error: e instanceof Error ? e.message : String(e) })
      console.error('[cron/transfer-backfill] failed', { household: householdId, e: e instanceof Error ? e.message : e })
    }
  }
  return summary
}
