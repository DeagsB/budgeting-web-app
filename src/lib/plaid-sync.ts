import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlaidApi, Transaction, RemovedTransaction } from 'plaid'
import { decryptToken, plaidAmountToCents } from '@/lib/plaid'
import {
  reconcileRows,
  buildCategoryIndex,
  suggestCategory,
  type ExistingTx,
  type HistoryEntry,
} from '@/lib/statement-reconcile'
import { cleanTitle } from '@/lib/title'
import { notifyTransactionInserted, notifyBudgetOverspendIfCrossed } from '@/lib/push'

/**
 * Pulls a Plaid item's transactions and merges them into Maple, mirroring the
 * CSV/OFX commit path (src/app/(app)/transactions/import/actions.ts): a Plaid
 * transaction that reconciles to an existing email-alert row UPGRADES that row's
 * generic title with the real merchant instead of inserting a duplicate.
 *
 * Runs with the service-role client (no user session) — invoked by the webhook,
 * the cron sweep, and the manual "Sync now" action.
 */

const TOLERANCE_DAYS = 5

export type PlaidSyncResult = {
  added: number
  modified: number
  removed: number
  reconciled: number
  status: 'ok' | 'login_required' | 'error'
  error?: string
}

export type PlaidItemRow = {
  id: string
  household_id: string
  item_id: string
  cursor: string | null
}

type Db = SupabaseClient

function shiftISO(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// Plaid surfaces ITEM_LOGIN_REQUIRED (and friends) as an Axios error whose body
// carries the Plaid error_code. Dig it out without depending on Axios types.
function plaidErrorCode(err: unknown): string | null {
  const body = (err as { response?: { data?: { error_code?: unknown } } })?.response?.data
  return typeof body?.error_code === 'string' ? body.error_code : null
}

type MappedAccount = { id: string; memberId: string | null; name: string | null }

type StagedAdd = {
  external_id: string
  account_id: string
  member_id: string | null
  occurred_on: string
  amount_cents: number
  description: string | null
  accountName: string | null
}

export async function syncPlaidItem(
  db: Db,
  plaid: PlaidApi,
  item: PlaidItemRow,
): Promise<PlaidSyncResult> {
  // 1. Decrypt the access token (service-role read; never reaches the client).
  const { data: secret } = await db
    .from('plaid_item_secrets')
    .select('access_token_encrypted')
    .eq('item_id', item.id)
    .maybeSingle()
  if (!secret?.access_token_encrypted) {
    return finish(db, item, { added: 0, modified: 0, removed: 0, reconciled: 0, status: 'error', error: 'Missing access token.' })
  }
  const accessToken = decryptToken(secret.access_token_encrypted as string)

  // 2. Drain /transactions/sync, persisting the cursor after every page so a
  //    crash resumes rather than replays.
  const added: Transaction[] = []
  const modified: Transaction[] = []
  const removed: RemovedTransaction[] = []
  let cursor = item.cursor ?? undefined
  try {
    let hasMore = true
    while (hasMore) {
      const resp = await plaid.transactionsSync({ access_token: accessToken, cursor })
      added.push(...resp.data.added)
      modified.push(...resp.data.modified)
      removed.push(...resp.data.removed)
      cursor = resp.data.next_cursor
      hasMore = resp.data.has_more
      await db.from('plaid_items').update({ cursor }).eq('id', item.id)
    }
  } catch (err) {
    if (plaidErrorCode(err) === 'ITEM_LOGIN_REQUIRED') {
      await db.from('plaid_items').update({ status: 'login_required' }).eq('id', item.id)
      return finish(db, item, { added: 0, modified: 0, removed: 0, reconciled: 0, status: 'login_required' })
    }
    const msg = err instanceof Error ? err.message : 'Plaid sync failed.'
    return finish(db, item, { added: 0, modified: 0, removed: 0, reconciled: 0, status: 'error', error: msg })
  }

  // 3. Map Plaid accounts → Maple accounts for this item.
  const { data: acctRows } = await db
    .from('accounts')
    .select('id, plaid_account_id, ownership, member_id, name')
    .eq('household_id', item.household_id)
    .eq('plaid_item_id', item.id)
  const acctMap = new Map<string, MappedAccount>()
  for (const a of acctRows ?? []) {
    const pid = a.plaid_account_id as string | null
    if (!pid) continue
    acctMap.set(pid, {
      id: a.id as string,
      memberId: a.ownership === 'member' ? ((a.member_id as string | null) ?? null) : null,
      name: (a.name as string | null) ?? null,
    })
  }

  const toStaged = (t: Transaction): StagedAdd | null => {
    const acct = acctMap.get(t.account_id)
    if (!acct) return null // account not mapped → skip (logged via skipped count)
    const raw = t.merchant_name ?? t.name ?? null
    return {
      external_id: t.transaction_id,
      account_id: acct.id,
      member_id: acct.memberId,
      occurred_on: t.authorized_date ?? t.date,
      amount_cents: plaidAmountToCents(t.amount),
      description: raw ? (cleanTitle(raw) ?? raw) : null,
      accountName: acct.name,
    }
  }

  const addedRows = added.map(toStaged).filter((r): r is StagedAdd => r !== null)
  const modifiedRows = modified.map(toStaged).filter((r): r is StagedAdd => r !== null)

  // 4. Reconcile the ADDED rows against existing transactions (esp. email
  //    alerts) so we enrich rather than duplicate.
  let reconciledCount = 0
  const inserted: { id: string; amount_cents: number; category_id: string | null; accountName: string | null; occurred_on: string; description: string | null }[] = []

  if (addedRows.length > 0) {
    const dates = addedRows.map((r) => r.occurred_on).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
    const accountIds = Array.from(new Set(addedRows.map((r) => r.account_id)))
    const winStart = shiftISO(dates[0], -TOLERANCE_DAYS)
    const winEnd = shiftISO(dates[dates.length - 1], TOLERANCE_DAYS)
    const historySince = shiftISO(dates[0], -400)

    const [{ data: existingRows }, { data: historyRows }] = await Promise.all([
      db
        .from('transactions')
        .select('id, account_id, occurred_on, amount_cents, description, source')
        .eq('household_id', item.household_id)
        .in('account_id', accountIds)
        .gte('occurred_on', winStart)
        .lte('occurred_on', winEnd)
        .limit(5000),
      db
        .from('transactions')
        .select('description, transaction_splits(category_id)')
        .eq('household_id', item.household_id)
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
    const catIndex = buildCategoryIndex(history)

    const matches = reconcileRows(
      addedRows.map((r) => ({ account_id: r.account_id, occurred_on: r.occurred_on, amount_cents: r.amount_cents })),
      existing,
      { toleranceDays: TOLERANCE_DAYS },
    )

    for (let i = 0; i < addedRows.length; i++) {
      const r = addedRows[i]
      const m = matches[i]
      // Enrich an existing NON-plaid row (typically an email alert) and adopt
      // this txn's external_id so future `modified` events update it. A match
      // that is itself a plaid row means we've already synced this txn → the
      // insert below will 23505-dedup, so fall through.
      if (m.matchedTxId && m.matchedSource !== 'plaid') {
        await db
          .from('transactions')
          .update({
            description: r.description ?? m.matchedDescription ?? null,
            source: 'plaid',
            external_id: r.external_id,
          })
          .eq('id', m.matchedTxId)
          .eq('household_id', item.household_id)
        reconciledCount += 1
        continue
      }

      const { data, error } = await db
        .from('transactions')
        .insert({
          household_id: item.household_id,
          account_id: r.account_id,
          member_id: r.member_id,
          occurred_on: r.occurred_on,
          amount_cents: r.amount_cents,
          description: r.description,
          source: 'plaid',
          external_id: r.external_id,
        })
        .select('id')
        .single()
      if (error || !data) continue // 23505 = already synced → dedup
      inserted.push({
        id: data.id as string,
        amount_cents: r.amount_cents,
        category_id: suggestCategory(r.description, catIndex),
        accountName: r.accountName,
        occurred_on: r.occurred_on,
        description: r.description,
      })
    }

    if (inserted.length > 0) {
      await db.from('transaction_splits').insert(
        inserted.map((row) => ({
          household_id: item.household_id,
          transaction_id: row.id,
          category_id: row.category_id,
          amount_cents: row.amount_cents,
          sort_order: 0,
        })),
      )
    }
  }

  // 5. MODIFIED → update the existing row (and its split amount) by external_id.
  for (const r of modifiedRows) {
    const { data: existing } = await db
      .from('transactions')
      .update({
        amount_cents: r.amount_cents,
        occurred_on: r.occurred_on,
        description: r.description,
      })
      .eq('household_id', item.household_id)
      .eq('external_id', r.external_id)
      .select('id')
      .maybeSingle()
    if (existing?.id) {
      await db
        .from('transaction_splits')
        .update({ amount_cents: r.amount_cents })
        .eq('transaction_id', existing.id as string)
        .eq('household_id', item.household_id)
    }
  }

  // 6. REMOVED → delete the matching plaid rows (splits cascade). Covers the
  //    pending→posted transition (Plaid removes the pending id).
  const removedIds = removed.map((r) => r.transaction_id).filter((x): x is string => !!x)
  if (removedIds.length > 0) {
    await db
      .from('transactions')
      .delete()
      .eq('household_id', item.household_id)
      .eq('source', 'plaid')
      .in('external_id', removedIds)
  }

  // 7. Push for genuinely-new rows (reconciled upgrades were already notified
  //    when their email alert arrived).
  for (const row of inserted) {
    await notifyTransactionInserted(item.household_id, {
      amountCents: row.amount_cents,
      accountName: row.accountName,
      description: row.description,
    })
    await notifyBudgetOverspendIfCrossed(item.household_id, {
      amountCents: row.amount_cents,
      categoryId: row.category_id,
      occurredOn: row.occurred_on,
    })
  }

  return finish(db, item, {
    added: inserted.length,
    modified: modifiedRows.length,
    removed: removedIds.length,
    reconciled: reconciledCount,
    status: 'ok',
  })
}

// Stamp the item + write a sync-log row, then return the result.
async function finish(db: Db, item: PlaidItemRow, result: PlaidSyncResult): Promise<PlaidSyncResult> {
  await db
    .from('plaid_items')
    .update({
      last_synced_at: new Date().toISOString(),
      status: result.status === 'login_required' ? 'login_required' : result.status === 'error' ? 'error' : 'active',
      error_detail: result.error ?? null,
    })
    .eq('id', item.id)

  await db.from('plaid_sync_log').insert({
    household_id: item.household_id,
    item_id: item.id,
    added: result.added,
    modified: result.modified,
    removed: result.removed,
    reconciled: result.reconciled,
    status: result.status,
    error_detail: result.error ?? null,
  })

  return result
}
