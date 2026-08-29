import type { SupabaseClient } from '@supabase/supabase-js'
import { createPlaidClient } from '@/lib/plaid'
import { syncPlaidItem, type PlaidSyncResult } from '@/lib/plaid-sync'
import { reconcileItemStatus } from '@/lib/plaid-item-health'

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

export type HealthSweepSummary = { considered: number; healed: number; unchanged: number; unreachable: number }

/**
 * Health pass for banks that are waiting on the user: one /item/get each
 * (answered from Plaid's side, never a login at the bank), so a status left
 * behind by a late or out-of-order webhook heals itself within a day, and a
 * bank repaired without us hearing LOGIN_REPAIRED gets synced. Banks that
 * really do still need the user stay exactly as they are. Revoked
 * connections need a fresh Link, not a check, so they are left out.
 */
export async function runPlaidHealthSweep(
  service: SupabaseClient,
  opts: { budgetMs: number },
): Promise<HealthSweepSummary> {
  const out: HealthSweepSummary = { considered: 0, healed: 0, unchanged: 0, unreachable: 0 }
  const plaid = createPlaidClient()
  if (!plaid) return out

  const { data: items } = await service
    .from('plaid_items')
    .select('id, household_id, item_id, cursor, status')
    .in('status', ['login_required', 'pending_disconnect', 'error'])
    .order('updated_at', { ascending: true })
  const rows = items ?? []
  out.considered = rows.length

  const started = Date.now()
  for (let i = 0; i < rows.length; i++) {
    if (Date.now() - started > opts.budgetMs) break
    const it = rows[i]
    const row = {
      id: it.id as string,
      household_id: it.household_id as string,
      item_id: it.item_id as string,
      cursor: (it.cursor as string | null) ?? null,
    }
    const res = await reconcileItemStatus(service, plaid, { ...row, status: it.status as string }, { source: 'cron' })
    if (!res.reachable) out.unreachable += 1
    else if (res.status === 'active') {
      out.healed += 1
      await syncPlaidItem(service, plaid, row, { trigger: 'cron' })
    } else out.unchanged += 1
    if (i < rows.length - 1) await new Promise((r) => setTimeout(r, STAGGER_MS))
  }
  return out
}
