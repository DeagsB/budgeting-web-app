import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The household's transfer pairs, loaded once per request. Reporting pages
 * skip both legs of every pair; the transactions list uses the per-row map
 * to label a leg and find its counterpart.
 *
 * Under a session client RLS trims this to pairs the caller can see at least
 * one leg of - exactly the legs that appear in that caller's own queries, so
 * a JS-side `legIds.has(id)` filter is consistent by construction. Never
 * embed `transfers` from `transactions` in PostgREST: two FKs to one table
 * make the relationship ambiguous.
 */

export type TransferPairRow = { id: string; out_transaction_id: string; in_transaction_id: string }
export type TransferLeg = { transferId: string; counterpartTxId: string; side: 'out' | 'in' }
export type HouseholdTransfers = {
  pairs: TransferPairRow[]
  /** Every transaction id that is a leg of a pair. */
  legIds: Set<string>
  byTx: Map<string, TransferLeg>
}

const PAGE = 1000

/**
 * Pages degrade to "no legs" when the read fails (a report with one wrong
 * figure beats a crashed page); detection must not, because a missing page
 * would re-pair rows that are already legs. `strict` throws instead.
 */
export async function loadTransfers(
  db: SupabaseClient,
  householdId: string,
  opts: { strict?: boolean } = {},
): Promise<HouseholdTransfers> {
  const pairs: TransferPairRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('transfers')
      .select('id, out_transaction_id, in_transaction_id')
      .eq('household_id', householdId)
      .order('created_at')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) {
      if (opts.strict) throw new Error(`transfers load failed (${error.code ?? '?'}): ${error.message}`)
      console.error('[transfer] load failed', { household: householdId, code: error.code, msg: error.message })
      break
    }
    for (const r of data ?? []) {
      pairs.push({
        id: r.id as string,
        out_transaction_id: r.out_transaction_id as string,
        in_transaction_id: r.in_transaction_id as string,
      })
    }
    if (!data || data.length < PAGE) break
  }
  return indexTransfers(pairs)
}

/** Pure assembly, so a page that already holds the rows can build the same shape. */
export function indexTransfers(pairs: TransferPairRow[]): HouseholdTransfers {
  const legIds = new Set<string>()
  const byTx = new Map<string, TransferLeg>()
  for (const p of pairs) {
    legIds.add(p.out_transaction_id)
    legIds.add(p.in_transaction_id)
    byTx.set(p.out_transaction_id, { transferId: p.id, counterpartTxId: p.in_transaction_id, side: 'out' })
    byTx.set(p.in_transaction_id, { transferId: p.id, counterpartTxId: p.out_transaction_id, side: 'in' })
  }
  return { pairs, legIds, byTx }
}

export async function loadTransferLegIds(
  db: SupabaseClient,
  householdId: string,
  opts: { strict?: boolean } = {},
): Promise<Set<string>> {
  return (await loadTransfers(db, householdId, opts)).legIds
}
