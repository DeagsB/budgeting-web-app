import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/service'
import { isUniqueViolation } from '@/lib/plaid-sync-plan'
import { ruleMatches, type TransactionRule } from '@/lib/transaction-rules'
import { loadTransferLegIds } from '@/lib/transfer-legs'
import {
  TRANSFER_WINDOW_DAYS,
  matchTransfers,
  type TransferAccount,
  type TransferPair,
  type TransferRow,
} from '@/lib/transfer-match'

/**
 * Transfer detection, I/O side. `src/lib/transfer-match.ts` decides; this
 * file loads the household's ledger around the rows in question, persists
 * the pairs it decided, and reports which of the rows are now legs. Used by
 * the rule pipeline (every ingest path), the delete / edit actions (re-detect
 * a freed partner) and the daily backfill.
 *
 * Runs with the service role when the key is available (`transferDb`): the
 * two legs of a transfer can sit on two members' private accounts, and a
 * CSV / manual ingest under a user session would otherwise never see the
 * partner's leg. Every query is scoped by household id, which callers take
 * from the authenticated context, the Plaid item, or the ingest secret.
 */

export function transferDb(db: SupabaseClient): SupabaseClient {
  return createServiceClient() ?? db
}

export type TransferDetectResult = {
  paired: number
  pairs: TransferPair[]
  /**
   * Requested ids that were already legs, plus BOTH legs of every pair this
   * run wrote (a partner claimed from the pool counts too, so a caller that
   * inserted it in the same batch does not announce it as new spending).
   */
  legIds: Set<string>
  /**
   * Set when the pass was not complete: the ledger could not be read in
   * full (nothing was paired) or a pair failed to write for a reason other
   * than "already paired" / "legs changed". A backfill must not stamp on it.
   */
  error?: string
}

export type TransferDetectOptions = {
  /** Enabled rules; only `is_settlement` ones matter. Loaded when omitted. */
  rules?: TransactionRule[]
  dryRun?: boolean
}

const CHUNK = 500
const PAGE = 1000
const POOL_SELECT =
  'id, account_id, member_id, amount_cents, occurred_on, transfer_ignored, plaid_pfc_primary, plaid_pfc_detailed, description'

const EMPTY: TransferDetectResult = { paired: 0, pairs: [], legIds: new Set() }

function shiftISO(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type PoolRow = TransferRow & { member_id: string | null }

async function loadPool(
  db: SupabaseClient,
  householdId: string,
  window: { from: string; to: string } | null,
): Promise<PoolRow[]> {
  const rows: PoolRow[] = []
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from('transactions')
      .select(POOL_SELECT)
      .eq('household_id', householdId)
      .neq('amount_cents', 0)
      .eq('transfer_ignored', false)
    if (window) q = q.gte('occurred_on', window.from).lte('occurred_on', window.to)
    const { data, error } = await q.order('occurred_on').order('id').range(from, from + PAGE - 1)
    // A partial ledger must never be matched against: a missing page hides
    // the counterpart and, worse, would let the backfill stamp a household
    // as done. Throw; the ingest wrapper turns it into a logged no-op and the
    // backfill leaves the household for the next run.
    if (error) throw new Error(`pool load failed (${error.code ?? '?'}): ${error.message}`)
    for (const r of data ?? []) {
      rows.push({
        id: r.id as string,
        account_id: r.account_id as string,
        member_id: (r.member_id as string | null) ?? null,
        amount_cents: Number(r.amount_cents),
        occurred_on: r.occurred_on as string,
        transfer_ignored: Boolean(r.transfer_ignored),
        linked: false,
        settlementCandidate: false,
        pfc_primary: (r.plaid_pfc_primary as string | null) ?? null,
        pfc_detailed: (r.plaid_pfc_detailed as string | null) ?? null,
        description: (r.description as string | null) ?? null,
      })
    }
    if (!data || data.length < PAGE) break
  }
  return rows
}

function loadFailure(what: string, error: { code?: string | null; message: string }): Error {
  return new Error(`${what} load failed (${error.code ?? '?'}): ${error.message}`)
}

async function loadSettlementRules(db: SupabaseClient, householdId: string): Promise<TransactionRule[]> {
  const { data, error } = await db
    .from('transaction_rules')
    .select('id, household_id, name, enabled, sort_order, match_text, amount_min_cents, amount_max_cents, account_id, direction, share_mode, share_weights, category_id, is_settlement')
    .eq('household_id', householdId)
    .eq('enabled', true)
    .eq('is_settlement', true)
  if (error) throw loadFailure('settlement rules', error)
  return (data ?? []).map((r) => ({
    id: r.id as string,
    household_id: r.household_id as string,
    name: r.name as string,
    enabled: r.enabled as boolean,
    sort_order: Number(r.sort_order),
    match_text: r.match_text as string,
    amount_min_cents: r.amount_min_cents === null ? null : Number(r.amount_min_cents),
    amount_max_cents: r.amount_max_cents === null ? null : Number(r.amount_max_cents),
    account_id: (r.account_id as string | null) ?? null,
    direction: r.direction as TransactionRule['direction'],
    share_mode: r.share_mode as TransactionRule['share_mode'],
    share_weights: (r.share_weights as Record<string, number> | null) ?? null,
    category_id: (r.category_id as string | null) ?? null,
    is_settlement: Boolean(r.is_settlement),
  }))
}

/** Rows already evidencing a settlement (either side) never become transfer legs. */
async function loadSettlementEvidenceIds(db: SupabaseClient, householdId: string): Promise<Set<string>> {
  const ids = new Set<string>()
  const { data, error } = await db
    .from('settlements')
    .select('paid_transaction_id, received_transaction_id')
    .eq('household_id', householdId)
    .or('paid_transaction_id.not.is.null,received_transaction_id.not.is.null')
  if (error) throw loadFailure('settlement evidence', error)
  for (const s of data ?? []) {
    if (s.paid_transaction_id) ids.add(s.paid_transaction_id as string)
    if (s.received_transaction_id) ids.add(s.received_transaction_id as string)
  }
  return ids
}

async function loadAccounts(db: SupabaseClient, householdId: string): Promise<Map<string, TransferAccount>> {
  // Archived accounts stay in: they still moved money while they were open.
  const { data, error } = await db.from('accounts').select('id, type, ownership, member_id').eq('household_id', householdId)
  if (error) throw loadFailure('accounts', error)
  return new Map(
    (data ?? []).map((a) => [
      a.id as string,
      {
        id: a.id as string,
        type: a.type as string,
        ownership: a.ownership as TransferAccount['ownership'],
        member_id: (a.member_id as string | null) ?? null,
      },
    ]),
  )
}

async function runDetection(
  db: SupabaseClient,
  householdId: string,
  pool: PoolRow[],
  candidateIds: Set<string>,
  opts: TransferDetectOptions,
): Promise<TransferDetectResult> {
  if (pool.length === 0 || candidateIds.size === 0) return { paired: 0, pairs: [], legIds: new Set() }

  // Every load is strict: a partial view of the ledger would pair rows that
  // are already legs (harmless, 23505) or miss a settlement / an account
  // (a wrong pair), and a backfill would then stamp the household as done.
  const [legIds, evidence, accounts, rules] = await Promise.all([
    loadTransferLegIds(db, householdId, { strict: true }),
    loadSettlementEvidenceIds(db, householdId),
    loadAccounts(db, householdId),
    opts.rules ? Promise.resolve(opts.rules.filter((r) => r.is_settlement && r.enabled)) : loadSettlementRules(db, householdId),
  ])

  for (const r of pool) {
    r.linked = legIds.has(r.id) || evidence.has(r.id)
    r.settlementCandidate =
      rules.length > 0 &&
      rules.some((rule) =>
        ruleMatches(rule, {
          id: r.id,
          description: r.description,
          amount_cents: r.amount_cents,
          account_id: r.account_id,
          member_id: r.member_id,
        }),
      )
  }

  const { pairs } = matchTransfers({ candidateIds, pool, accounts })
  const written: TransferPair[] = []
  let failed = 0
  let lastFailure: string | null = null
  if (!opts.dryRun) {
    for (const p of pairs) {
      const { error } = await db.from('transfers').insert({
        household_id: householdId,
        out_transaction_id: p.out_transaction_id,
        in_transaction_id: p.in_transaction_id,
      })
      if (!error) {
        written.push(p)
        continue
      }
      // 23505: another run paired one of these legs first. 23514 / 23503: the
      // trigger saw a leg that changed under us (or was just marked "Not a
      // transfer"). Both mean "skip", not "fail". Anything else is a failed
      // pass: keep going so the rest of the batch lands, but say so.
      if (isUniqueViolation(error) || error.code === '23514' || error.code === '23503') continue
      failed += 1
      lastFailure = `${error.code ?? '?'}: ${error.message}`
      console.error('[transfer] insert failed', { household: householdId, code: error.code, msg: error.message })
    }
  }

  const effective = opts.dryRun ? pairs : written
  const resultLegs = new Set<string>()
  for (const id of candidateIds) if (legIds.has(id)) resultLegs.add(id)
  for (const p of effective) {
    resultLegs.add(p.out_transaction_id)
    resultLegs.add(p.in_transaction_id)
  }
  const result: TransferDetectResult = { paired: effective.length, pairs: effective, legIds: resultLegs }
  if (failed > 0) result.error = `${failed} pair${failed === 1 ? '' : 's'} failed to write (last: ${lastFailure})`
  return result
}

/**
 * Pair the given rows against the household ledger within the transfer
 * window on either side of them. Rows already paired are reported as legs
 * without being touched. Never throws for a single row.
 */
export async function detectTransfersForTransactions(
  db: SupabaseClient,
  householdId: string,
  txIds: string[],
  opts: TransferDetectOptions = {},
): Promise<TransferDetectResult> {
  const ids = Array.from(new Set(txIds.filter(Boolean)))
  if (ids.length === 0) return EMPTY

  let min: string | null = null
  let max: string | null = null
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await db
      .from('transactions')
      .select('occurred_on')
      .eq('household_id', householdId)
      .in('id', ids.slice(i, i + CHUNK))
    for (const r of data ?? []) {
      const d = r.occurred_on as string
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
      if (min === null || d < min) min = d
      if (max === null || d > max) max = d
    }
  }
  if (min === null || max === null) return EMPTY

  // An ingest never fails because detection could not read the ledger; the
  // rows simply stay unpaired until the next candidate-bearing pass.
  try {
    const pool = await loadPool(db, householdId, {
      from: shiftISO(min, -TRANSFER_WINDOW_DAYS),
      to: shiftISO(max, TRANSFER_WINDOW_DAYS),
    })
    return await runDetection(db, householdId, pool, new Set(ids), opts)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[transfer] detection skipped', { household: householdId, error: message })
    return { ...EMPTY, legIds: new Set(), error: message }
  }
}

/** The one-time historical pass: every row is a candidate. Throws when the ledger cannot be read in full. */
export async function detectTransfersForHousehold(
  db: SupabaseClient,
  householdId: string,
  opts: TransferDetectOptions = {},
): Promise<TransferDetectResult> {
  const pool = await loadPool(db, householdId, null)
  return runDetection(db, householdId, pool, new Set(pool.map((r) => r.id)), opts)
}

/**
 * The other legs of any pair touching `txIds`, minus `txIds` themselves.
 * Call it BEFORE an amount / account change or a delete: the DB drops the
 * pair on its own, and the freed partner then needs a fresh detect.
 */
export async function transferPartnerIds(db: SupabaseClient, householdId: string, txIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(txIds.filter(Boolean)))
  if (ids.length === 0) return []
  const own = new Set(ids)
  const partners = new Set<string>()
  const STEP = 200
  for (let i = 0; i < ids.length; i += STEP) {
    const list = ids.slice(i, i + STEP).join(',')
    const { data, error } = await db
      .from('transfers')
      .select('out_transaction_id, in_transaction_id')
      .eq('household_id', householdId)
      .or(`out_transaction_id.in.(${list}),in_transaction_id.in.(${list})`)
    if (error) {
      console.error('[transfer] partner lookup failed', { household: householdId, code: error.code, msg: error.message })
      continue
    }
    for (const t of data ?? []) {
      const out = t.out_transaction_id as string
      const inn = t.in_transaction_id as string
      if (own.has(out) && !own.has(inn)) partners.add(inn)
      if (own.has(inn) && !own.has(out)) partners.add(out)
    }
  }
  return Array.from(partners)
}
