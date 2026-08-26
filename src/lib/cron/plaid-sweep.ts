import type { SupabaseClient } from '@supabase/supabase-js'
import { createPlaidClient } from '@/lib/plaid'
import { syncPlaidItem, type PlaidSyncResult } from '@/lib/plaid-sync'

export type SweepSummary = {
  considered: number
  synced: number
  skipped: number
  errors: number
  remaining: number
  items: { id: string; status: PlaidSyncResult['status']; added: number; error?: string }[]
}

const STAGGER_MS = 500

function timeout<T>(p: Promise<T>, ms: number): Promise<T | 'timeout'> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve('timeout'), ms)
    p.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      () => {
        clearTimeout(t)
        resolve('timeout')
      },
    )
  })
}

/**
 * Safety-net sweep: sync every active item, oldest-synced first, within a
 * wall-clock budget. Webhooks are the primary trigger; this catches missed
 * deliveries and items whose webhook URL was never registered. Items that do
 * not fit in the budget are simply picked up next run. A per-item timeout
 * leaves the lease to expire on its own (5 min) rather than killing the run.
 */
export async function runPlaidSweep(
  service: SupabaseClient,
  opts: { budgetMs: number; perItemMs: number },
): Promise<SweepSummary> {
  const summary: SweepSummary = { considered: 0, synced: 0, skipped: 0, errors: 0, remaining: 0, items: [] }
  const plaid = createPlaidClient()
  if (!plaid) return summary

  const { data: items } = await service
    .from('plaid_items')
    .select('id, household_id, item_id, cursor')
    .eq('status', 'active')
    .order('last_synced_at', { ascending: true, nullsFirst: true })
  const rows = items ?? []
  summary.considered = rows.length

  const started = Date.now()
  for (let i = 0; i < rows.length; i++) {
    if (Date.now() - started > opts.budgetMs) {
      summary.remaining = rows.length - i
      break
    }
    const it = rows[i]
    const res = await timeout(
      syncPlaidItem(
        service,
        plaid,
        {
          id: it.id as string,
          household_id: it.household_id as string,
          item_id: it.item_id as string,
          cursor: (it.cursor as string | null) ?? null,
        },
        { trigger: 'cron' },
      ),
      opts.perItemMs,
    )
    if (res === 'timeout') {
      summary.errors += 1
      summary.items.push({ id: it.id as string, status: 'error', added: 0, error: 'timeout' })
      console.error('[cron/plaid-sweep] item timed out', { item: it.id })
    } else {
      if (res.status === 'ok') summary.synced += 1
      else if (res.status === 'skipped_locked' || res.status === 'transient') summary.skipped += 1
      else summary.errors += 1
      summary.items.push({ id: it.id as string, status: res.status, added: res.added, error: res.error })
    }
    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, STAGGER_MS))
  }
  return summary
}
