'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { applyRulesToTransactions } from '@/lib/transaction-rules-apply'
import {
  reconcileRows,
  buildCategoryIndex,
  suggestCategory,
  type ExistingTx,
  type HistoryEntry,
} from '@/lib/statement-reconcile'
import { cleanTitle } from '@/lib/title'

export type ImportState =
  | { error: string }
  | { ok: true; count: number; skipped: number; reconciled: number }
  | undefined

export type StagedTx = {
  occurred_on: string // YYYY-MM-DD
  amount_cents: number
  description: string | null
  account_id: string
  category_id: string | null
  member_id: string | null
  external_id?: string | null // OFX FITID for dedup
  source?: 'csv_import' | 'ofx_import'
  // When set, this row reconciles to an existing transaction (e.g. an email
  // alert): we enrich that row's description instead of inserting a duplicate.
  matched_tx_id?: string | null
}

// One annotation per staged row (index-aligned), produced by analyzeImport.
export type RowAnnotation = {
  matchedTxId: string | null
  matchedSource: string | null
  matchedDate: string | null
  matchedDescription: string | null
  suggestedCategoryId: string | null
}

const TOLERANCE_DAYS = 5

function shiftISO(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Read-only analysis pass: match the staged rows against existing transactions
 * (so the import doesn't duplicate what the email alerts already recorded) and
 * suggest a category for each row from the household's categorisation history.
 * Returns annotations index-aligned to `rows`.
 */
export async function analyzeImport(rows: StagedTx[]): Promise<RowAnnotation[]> {
  const empty = (): RowAnnotation[] =>
    rows.map(() => ({
      matchedTxId: null,
      matchedSource: null,
      matchedDate: null,
      matchedDescription: null,
      suggestedCategoryId: null,
    }))

  if (!Array.isArray(rows) || rows.length === 0) return []
  const ctx = await getHouseholdContext()
  if (!ctx) return empty()
  const supabase = await createClient()

  const validDates = rows
    .map((r) => r.occurred_on)
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
  const accountIds = Array.from(new Set(rows.map((r) => r.account_id).filter(Boolean)))
  if (validDates.length === 0 || accountIds.length === 0) return empty()

  const winStart = shiftISO(validDates[0], -TOLERANCE_DAYS)
  const winEnd = shiftISO(validDates[validDates.length - 1], TOLERANCE_DAYS)
  // Category history: look back ~13 months so seasonal merchants are covered.
  const historySince = shiftISO(validDates[0], -400)

  const [{ data: existingRows }, { data: historyRows }] = await Promise.all([
    supabase
      .from('transactions')
      .select('id, account_id, occurred_on, amount_cents, description, source')
      .eq('household_id', ctx.householdId)
      .in('account_id', accountIds)
      .gte('occurred_on', winStart)
      .lte('occurred_on', winEnd)
      .limit(5000),
    supabase
      .from('transactions')
      .select('description, transaction_splits(category_id)')
      .eq('household_id', ctx.householdId)
      .gte('occurred_on', historySince)
      .limit(4000),
  ])

  const existing: ExistingTx[] = (existingRows ?? []).map((e) => ({
    id: e.id as string,
    account_id: e.account_id as string,
    occurred_on: e.occurred_on as string,
    amount_cents: Number(e.amount_cents),
    description: (e.description as string | null) ?? null,
    source: (e.source as string) ?? 'manual',
  }))

  const history: HistoryEntry[] = []
  for (const t of historyRows ?? []) {
    const splits = (t as { transaction_splits?: { category_id: string | null }[] }).transaction_splits ?? []
    for (const s of splits) {
      history.push({ description: (t as { description: string | null }).description, category_id: s.category_id })
    }
  }

  const matches = reconcileRows(
    rows.map((r) => ({ account_id: r.account_id, occurred_on: r.occurred_on, amount_cents: r.amount_cents })),
    existing,
    { toleranceDays: TOLERANCE_DAYS },
  )
  const catIndex = buildCategoryIndex(history)

  return rows.map((r, i) => ({
    matchedTxId: matches[i].matchedTxId,
    matchedSource: matches[i].matchedSource,
    matchedDate: matches[i].matchedDate,
    matchedDescription: matches[i].matchedDescription,
    // Don't suggest a category for a row that already carries one (explicit CSV
    // column) or that reconciles to an existing transaction.
    suggestedCategoryId:
      r.category_id || matches[i].matchedTxId ? null : suggestCategory(r.description, catIndex),
  }))
}

export async function commitImport(
  _prev: ImportState,
  fd: FormData,
): Promise<ImportState> {
  const payload = String(fd.get('rows') ?? '')
  if (!payload) return { error: 'No rows to import.' }

  let rows: StagedTx[]
  try {
    rows = JSON.parse(payload)
  } catch {
    return { error: "Couldn't save that. Refresh and try again." }
  }
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'No rows to import.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()

  const inserted: { id: string; amount_cents: number; category_id: string | null }[] = []
  let skipped = 0
  let reconciled = 0
  const touchedIds: string[] = []
  for (const r of rows) {
    if (!r.occurred_on || !/^\d{4}-\d{2}-\d{2}$/.test(r.occurred_on)) continue
    if (!r.account_id) continue
    if (typeof r.amount_cents !== 'number' || !Number.isFinite(r.amount_cents)) continue

    // Reconciled row → enrich the existing transaction (better merchant name
    // from the statement) instead of inserting a duplicate. Keep its date and
    // category; only upgrade the description when the statement has one.
    if (r.matched_tx_id) {
      if (r.description && r.description.trim()) {
        await supabase
          .from('transactions')
          .update({ description: cleanTitle(r.description) ?? r.description })
          .eq('id', r.matched_tx_id)
          .eq('household_id', ctx.householdId)
      }
      reconciled += 1
      touchedIds.push(r.matched_tx_id)
      continue
    }

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        household_id: ctx.householdId,
        occurred_on: r.occurred_on,
        account_id: r.account_id,
        member_id: r.member_id,
        description: cleanTitle(r.description) ?? r.description,
        amount_cents: r.amount_cents,
        source: r.source ?? 'csv_import',
        external_id: r.external_id ?? null,
      })
      .select('id')
      .single()

    if (error || !data) {
      // 23505 = unique_violation → row already imported (FITID match). Count
      // it as skipped, not failed.
      if (error?.code === '23505') skipped += 1
      continue
    }
    inserted.push({ id: data.id, amount_cents: r.amount_cents, category_id: r.category_id })
  }

  if (inserted.length > 0) {
    await supabase.from('transaction_splits').insert(
      inserted.map((row) => ({
        household_id: ctx.householdId,
        transaction_id: row.id,
        category_id: row.category_id,
        amount_cents: row.amount_cents,
        sort_order: 0,
      })),
    )
  }

  // Rules run on new rows and on alerts whose title the statement just upgraded.
  const ruleTargets = [...inserted.map((row) => row.id), ...touchedIds]
  if (ruleTargets.length > 0) {
    await applyRulesToTransactions(supabase, ctx.householdId, ruleTargets)
  }

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/budgets')
  revalidatePath('/pnl')
  return { ok: true, count: inserted.length, skipped, reconciled }
}
