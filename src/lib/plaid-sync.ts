import { todayISO as torontoTodayISO } from './dates'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { AccountBase, PlaidApi, RemovedTransaction, Transaction } from 'plaid'
import { decryptToken, plaidAmountToCents } from '@/lib/plaid'
import { monthOfISO, snapshotsFromPlaidBalances, type PlaidBalanceAccount } from '@/lib/plaid-balances'
import type { AccountType } from '@/lib/domain'
import {
  reconcileRows,
  buildCategoryIndex,
  suggestCategory,
  type ExistingTx,
  type HistoryEntry,
} from '@/lib/statement-reconcile'
import { cleanTitle } from '@/lib/title'
import { notifyTransactionInserted, notifyBudgetOverspendIfCrossed } from '@/lib/push'
import { applyRulesToTransactions, loadRuleContext } from '@/lib/transaction-rules-apply'
import { detectTransfersForTransactions, transferPartnerIds } from '@/lib/transfer-detect'
import {
  classifyPlaidError,
  isUniqueViolation,
  planSplitUpdate,
  planSyncBatch,
  plaidErrorCode,
  shouldRefreshBalancesLive,
} from '@/lib/plaid-sync-plan'

/**
 * Pulls a Plaid item's transactions and merges them into Maple, mirroring the
 * CSV/OFX commit path (src/app/(app)/transactions/import/actions.ts): a Plaid
 * transaction that reconciles to an existing email-alert row UPGRADES that row's
 * generic title with the real merchant instead of inserting a duplicate.
 *
 * Runs with the service-role client (no user session) - invoked by the webhook
 * (in the background via `after()`), the daily cron sweep, the manual "Sync
 * now" action and pull-to-refresh.
 *
 * Durability rules:
 *  - The cursor is persisted ONLY after every row from the batch is written,
 *    with a compare-and-set on the cursor we started from. A crash mid-batch
 *    replays the batch (inserts dedup on external_id) instead of losing it.
 *  - A short lease on plaid_items serialises overlapping runs.
 *  - pending→posted migrates the existing row so categorisation, splits and
 *    shares survive.
 */

const TOLERANCE_DAYS = 5
const LEASE_MS = 5 * 60 * 1000

export type SyncTrigger = 'webhook' | 'cron' | 'manual' | 'pull'

export type PlaidSyncStatus =
  | 'ok'
  | 'login_required'
  | 'revoked'
  | 'transient'
  | 'error'
  | 'skipped_locked'

export type PlaidSyncResult = {
  added: number
  modified: number
  removed: number
  reconciled: number
  migrated: number
  skippedUnmapped: number
  insertFailed: number
  /** Transfer pairs written between the household's own accounts during this run. */
  transfersPaired: number
  status: PlaidSyncStatus
  error?: string
}

export type PlaidItemRow = {
  id: string
  household_id: string
  item_id: string
  cursor: string | null
}

type Db = SupabaseClient

const EMPTY: Omit<PlaidSyncResult, 'status'> = {
  added: 0,
  modified: 0,
  removed: 0,
  reconciled: 0,
  migrated: 0,
  skippedUnmapped: 0,
  insertFailed: 0,
  transfersPaired: 0,
}

function shiftISO(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

type MappedAccount = { id: string; memberId: string | null; name: string | null }

type StagedRow = {
  external_id: string
  account_id: string
  member_id: string | null
  occurred_on: string
  amount_cents: number
  description: string | null
  pending: boolean
  pending_external_id: string | null
  /** Plaid's personal_finance_category; the transfer matcher's strongest signal. */
  pfc_primary: string | null
  pfc_detailed: string | null
  accountName: string | null
}

type InsertedRow = {
  id: string
  amount_cents: number
  category_id: string | null
  accountName: string | null
  ownerMemberId: string | null
  occurred_on: string
  description: string | null
  pending: boolean
}

export async function syncPlaidItem(
  db: Db,
  plaid: PlaidApi,
  item: PlaidItemRow,
  opts: { trigger: SyncTrigger },
): Promise<PlaidSyncResult> {
  const trigger = opts.trigger

  // 0. Lease. A conditional update only succeeds when no other run holds it.
  const now = Date.now()
  const { data: leased } = await db
    .from('plaid_items')
    .update({ sync_lease_until: new Date(now + LEASE_MS).toISOString() })
    .eq('id', item.id)
    .or(`sync_lease_until.is.null,sync_lease_until.lt.${new Date(now).toISOString()}`)
    .select('id, cursor')
    .maybeSingle()
  if (!leased) {
    await log(db, item, trigger, { ...EMPTY, status: 'skipped_locked' })
    return { ...EMPTY, status: 'skipped_locked' }
  }
  // Use the freshest cursor, not the caller's possibly stale snapshot.
  const originalCursor = (leased.cursor as string | null) ?? null

  // 1. Decrypt the access token (service-role read; never reaches the client).
  const { data: secret } = await db
    .from('plaid_item_secrets')
    .select('access_token_encrypted')
    .eq('item_id', item.id)
    .maybeSingle()
  if (!secret?.access_token_encrypted) {
    return finish(db, item, trigger, { ...EMPTY, status: 'error', error: 'Missing access token.' })
  }
  let accessToken: string
  try {
    accessToken = decryptToken(secret.access_token_encrypted as string)
  } catch {
    return finish(db, item, trigger, {
      ...EMPTY,
      status: 'error',
      error: 'Could not decrypt the access token (was PLAID_TOKEN_KEY rotated?). Reconnect the bank.',
    })
  }

  // 2. Drain /transactions/sync fully into memory. No DB writes here: the cursor
  //    only moves once the batch is durably stored.
  const added: Transaction[] = []
  const modified: Transaction[] = []
  const removed: RemovedTransaction[] = []
  // Every page carries the item's accounts with their balances; keep the
  // last page's copy so the balance snapshot reflects the fully-drained state.
  let plaidAccounts: AccountBase[] = []
  let nextCursor: string | null = originalCursor
  try {
    let attempt = 0
    while (true) {
      try {
        let cursor = originalCursor ?? undefined
        let hasMore = true
        while (hasMore) {
          const resp = await plaid.transactionsSync({ access_token: accessToken, cursor })
          added.push(...resp.data.added)
          modified.push(...resp.data.modified)
          removed.push(...resp.data.removed)
          if (resp.data.accounts?.length) plaidAccounts = resp.data.accounts
          cursor = resp.data.next_cursor
          hasMore = resp.data.has_more
        }
        nextCursor = cursor ?? null
        break
      } catch (err) {
        // Plaid asks clients to restart pagination from the original cursor
        // when the item mutated mid-drain. Once is enough; then surface it.
        if (plaidErrorCode(err) === 'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION' && attempt === 0) {
          attempt += 1
          added.length = 0
          modified.length = 0
          removed.length = 0
          continue
        }
        throw err
      }
    }
  } catch (err) {
    const code = plaidErrorCode(err)
    const cls = classifyPlaidError(code)
    const msg = err instanceof Error ? err.message : 'Plaid sync failed.'
    if (cls === 'reauth') {
      const status = code === 'PENDING_DISCONNECT' ? 'pending_disconnect' : 'login_required'
      await db.from('plaid_items').update({ status }).eq('id', item.id)
      return finish(db, item, trigger, { ...EMPTY, status: 'login_required', error: code ?? msg })
    }
    if (cls === 'revoked') {
      await db.from('plaid_item_secrets').delete().eq('item_id', item.id)
      return finish(db, item, trigger, { ...EMPTY, status: 'revoked', error: code ?? msg })
    }
    if (cls === 'transient') {
      return finish(db, item, trigger, { ...EMPTY, status: 'transient', error: code ?? msg })
    }
    console.error('[plaid-sync] fatal', { item: item.id, code, msg })
    return finish(db, item, trigger, { ...EMPTY, status: 'error', error: code ? `${code}: ${msg}` : msg })
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

  // A bank with no accounts chosen syncs nothing - every row below is skipped
  // as unmapped. Flag it so the setup page and the dashboard notice can send
  // the user to "Choose accounts" instead of leaving a silent, empty bank.
  if (acctMap.size === 0) {
    await db.from('plaid_items').update({ needs_account_review: true }).eq('id', item.id)
  }

  let skippedUnmapped = 0
  const toStaged = (t: Transaction): StagedRow | null => {
    const acct = acctMap.get(t.account_id)
    if (!acct) {
      skippedUnmapped += 1
      return null
    }
    const raw = t.merchant_name ?? t.name ?? null
    return {
      external_id: t.transaction_id,
      account_id: acct.id,
      member_id: acct.memberId,
      occurred_on: t.authorized_date ?? t.date,
      amount_cents: plaidAmountToCents(t.amount),
      description: raw ? (cleanTitle(raw) ?? raw) : null,
      pending: t.pending === true,
      pending_external_id: t.pending_transaction_id ?? null,
      pfc_primary: t.personal_finance_category?.primary ?? null,
      pfc_detailed: t.personal_finance_category?.detailed ?? null,
      accountName: acct.name,
    }
  }

  const plan = planSyncBatch({ added, modified, removed })

  // 4. MIGRATIONS: pending → posted. Update the row we already hold so the
  //    user's category/splits/shares survive; only the identity + money move.
  let migrated = 0
  const migratedIds: string[] = []
  // Transfer legs whose partner's amount changed under them. The DB drops such
  // a pair on its own (transactions_transfer_leg_change), so the partner has
  // to be looked up BEFORE the write and re-detected with the batch below.
  const freedIds: string[] = []
  for (const mig of plan.migrations) {
    const r = toStaged(mig.posted)
    if (!r) continue
    const { data: row } = await db
      .from('transactions')
      .select('id, amount_cents, description')
      .eq('household_id', item.household_id)
      .eq('external_id', mig.pendingId)
      .maybeSingle()
    if (!row) {
      // We never held the pending row (e.g. account mapped later) → plain insert.
      plan.inserts.push(mig.posted)
      continue
    }
    const rowId = row.id as string
    const amountChanged = Number(row.amount_cents) !== r.amount_cents
    if (amountChanged) freedIds.push(...(await transferPartnerIds(db, item.household_id, [rowId])))
    await db
      .from('transactions')
      .update({
        external_id: r.external_id,
        plaid_pending_transaction_id: mig.pendingId,
        pending: false,
        amount_cents: r.amount_cents,
        occurred_on: r.occurred_on,
        // Keep an existing description: the pending name is usually the same
        // merchant and the user may have retitled it.
        description: (row.description as string | null) ?? r.description,
        plaid_pfc_primary: r.pfc_primary,
        plaid_pfc_detailed: r.pfc_detailed,
      })
      .eq('id', rowId)
    if (amountChanged) await applyAmountChange(db, item.household_id, rowId, r.amount_cents)
    migratedIds.push(rowId)
    migrated += 1
  }

  // 5. INSERTS: reconcile against existing rows (esp. email alerts) so we
  //    enrich rather than duplicate, then insert the rest.
  const addedRows = plan.inserts.map(toStaged).filter((r): r is StagedRow => r !== null)
  let reconciledCount = 0
  let insertFailed = 0
  const inserted: InsertedRow[] = []
  const reconciledIds: string[] = []

  if (addedRows.length > 0) {
    const dates = addedRows.map((r) => r.occurred_on).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
    const accountIds = Array.from(new Set(addedRows.map((r) => r.account_id)))
    const first = dates[0] ?? addedRows[0].occurred_on
    const last = dates[dates.length - 1] ?? first
    const winStart = shiftISO(first, -TOLERANCE_DAYS)
    const winEnd = shiftISO(last, TOLERANCE_DAYS)
    const historySince = shiftISO(first, -400)

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
        const { error } = await db
          .from('transactions')
          .update({
            description: r.description ?? m.matchedDescription ?? null,
            source: 'plaid',
            external_id: r.external_id,
            pending: r.pending,
            plaid_pending_transaction_id: r.pending_external_id,
            plaid_pfc_primary: r.pfc_primary,
            plaid_pfc_detailed: r.pfc_detailed,
          })
          .eq('id', m.matchedTxId)
          .eq('household_id', item.household_id)
        if (error) {
          // The external_id is already taken by another row → this Plaid txn is
          // known; leave the alert alone rather than double-claiming.
          if (!isUniqueViolation(error)) {
            insertFailed += 1
            console.error('[plaid-sync] reconcile update failed', { item: item.id, external_id: r.external_id, code: error.code })
          }
          continue
        }
        reconciledCount += 1
        reconciledIds.push(m.matchedTxId)
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
          pending: r.pending,
          plaid_pending_transaction_id: r.pending_external_id,
          plaid_pfc_primary: r.pfc_primary,
          plaid_pfc_detailed: r.pfc_detailed,
        })
        .select('id')
        .single()
      if (error || !data) {
        if (!isUniqueViolation(error)) {
          insertFailed += 1
          console.error('[plaid-sync] insert failed', { item: item.id, external_id: r.external_id, code: error?.code, msg: error?.message })
        }
        continue // 23505 = already synced → dedup
      }
      inserted.push({
        id: data.id as string,
        amount_cents: r.amount_cents,
        category_id: suggestCategory(r.description, catIndex),
        accountName: r.accountName,
        ownerMemberId: r.member_id,
        occurred_on: r.occurred_on,
        description: r.description,
        pending: r.pending,
      })
    }

    if (inserted.length > 0) {
      const { error } = await db.from('transaction_splits').insert(
        inserted.map((row) => ({
          household_id: item.household_id,
          transaction_id: row.id,
          category_id: row.category_id,
          amount_cents: row.amount_cents,
          sort_order: 0,
        })),
      )
      if (error) {
        insertFailed += inserted.length
        console.error('[plaid-sync] split insert failed', { item: item.id, code: error.code, msg: error.message })
      }
    }
  }

  // 5b. Household rules on everything new, newly-titled, just posted or
  //     freed from a transfer pair. Runs even with zero rules: the transfer
  //     pass inside pairs a card payment with its counterpart, and the
  //     resulting leg ids keep step 9 from announcing a transfer as spending.
  const ruleCtx = await loadRuleContext(db, item.household_id)
  const ruleTargets = [...inserted.map((row) => row.id), ...reconciledIds, ...migratedIds, ...freedIds]
  const transferLegs = new Set<string>()
  let transfersPaired = 0
  if (ruleTargets.length > 0) {
    const applied = await applyRulesToTransactions(db, item.household_id, ruleTargets, {}, ruleCtx)
    for (const id of applied.transferLegIds) transferLegs.add(id)
    transfersPaired += applied.transfersPaired
  }

  // 6. UPDATES (Plaid `modified`): money/date/title follow the bank; splits
  //    and shares are only touched when it is unambiguous. Rule-managed
  //    shares are re-derived against the new amount; manual ones are flagged.
  const modifiedRows = plan.updates.map(toStaged).filter((r): r is StagedRow => r !== null)
  const modifiedIds: string[] = []
  for (const r of modifiedRows) {
    const { data: row } = await db
      .from('transactions')
      .select('id, amount_cents')
      .eq('household_id', item.household_id)
      .eq('external_id', r.external_id)
      .maybeSingle()
    if (!row) continue
    const rowId = row.id as string
    const amountChanged = Number(row.amount_cents) !== r.amount_cents
    // Same as the migration loop: a partner the DB is about to unlink gets
    // re-detected alongside the row that changed.
    const partners = amountChanged ? await transferPartnerIds(db, item.household_id, [rowId]) : []
    await db
      .from('transactions')
      .update({
        amount_cents: r.amount_cents,
        occurred_on: r.occurred_on,
        description: r.description,
        pending: r.pending,
        plaid_pfc_primary: r.pfc_primary,
        plaid_pfc_detailed: r.pfc_detailed,
      })
      .eq('id', rowId)
    if (amountChanged) await applyAmountChange(db, item.household_id, rowId, r.amount_cents)
    modifiedIds.push(rowId, ...partners)
  }
  if (modifiedIds.length > 0) {
    const applied = await applyRulesToTransactions(db, item.household_id, modifiedIds, {}, ruleCtx)
    for (const id of applied.transferLegIds) transferLegs.add(id)
    transfersPaired += applied.transfersPaired
  }

  // 7. DELETES: whatever Plaid removed that was not a migrated pending id.
  //    The cascade drops any pair a removed row was a leg of, but 5b has
  //    already run, so the surviving partner would stay unpaired until the
  //    next batch touched it: find it first and re-detect it after.
  if (plan.deletes.length > 0) {
    const { data: doomedRows } = await db
      .from('transactions')
      .select('id')
      .eq('household_id', item.household_id)
      .eq('source', 'plaid')
      .in('external_id', plan.deletes)
    const doomed = (doomedRows ?? []).map((r) => r.id as string)
    const survivors = doomed.length > 0 ? await transferPartnerIds(db, item.household_id, doomed) : []
    await db
      .from('transactions')
      .delete()
      .eq('household_id', item.household_id)
      .eq('source', 'plaid')
      .in('external_id', plan.deletes)
    if (survivors.length > 0) {
      const redetect = await detectTransfersForTransactions(db, item.household_id, survivors, { rules: ruleCtx.rules })
      transfersPaired += redetect.paired
      // A survivor may have claimed a row inserted in THIS batch (its posted
      // replacement, typically); that row is a leg now and must not be pushed.
      for (const id of redetect.legIds) transferLegs.add(id)
    }
  }

  // 7b. Balances: every transaction from this batch is now written, so the
  //     bank's reported balance can be anchored against them. Best-effort:
  //     a failure here must never cost us the batch or the cursor.
  //     Sandbox (and some institutions) omit `accounts` from /transactions/sync
  //     pages, so fall back to /accounts/balance/get when nothing came back.
  //     Never make that live call when no account is mapped: there is nothing
  //     to write, and at MFA banks (CIBC) a live /accounts/balance/get is what
  //     provokes a fresh login demand, which Plaid then reports through an
  //     ITEM: ERROR webhook seconds after this run logged "ok" - the
  //     re-auth loop seen in production.
  //     Even with accounts mapped, the live call is throttled to about one a
  //     day per bank (see shouldRefreshBalancesLive).
  const written = await upsertPlaidBalanceSnapshots(db, item, plaidAccounts)
  if (shouldRefreshBalancesLive(acctMap.size, written)) {
    const lastLive = await latestSnapshotUpdatedAt(db, [...acctMap.values()].map((a) => a.id))
    if (shouldRefreshBalancesLive(acctMap.size, written, lastLive)) await refreshPlaidBalances(db, plaid, item)
  }

  // 8. Cursor: compare-and-set against the cursor this run started from. A
  //    miss means another run moved it; our rows are already deduped, so the
  //    next run simply continues from the newer cursor.
  let cursorError: string | undefined
  if (nextCursor !== originalCursor) {
    let q = db.from('plaid_items').update({ cursor: nextCursor }).eq('id', item.id)
    q = originalCursor === null ? q.is('cursor', null) : q.eq('cursor', originalCursor)
    const { data: moved } = await q.select('id').maybeSingle()
    if (!moved) {
      cursorError = 'Cursor moved during sync; batch applied, cursor left as-is.'
      console.error('[plaid-sync] cursor CAS miss', { item: item.id })
    }
  }

  // 9. Push for genuinely-new, posted rows (pending rows get their turn when
  //    they post; reconciled upgrades were notified by the alert; a transfer
  //    leg is money moving between the household's own accounts, not new
  //    spending, so it neither pings anyone nor counts against a budget).
  for (const row of inserted) {
    if (row.pending || transferLegs.has(row.id)) continue
    await notifyTransactionInserted(item.household_id, {
      amountCents: row.amount_cents,
      accountName: row.accountName,
      description: row.description,
      ownerMemberId: row.ownerMemberId,
    })
    await notifyBudgetOverspendIfCrossed(item.household_id, {
      amountCents: row.amount_cents,
      categoryId: row.category_id,
      occurredOn: row.occurred_on,
    })
  }

  return finish(db, item, trigger, {
    added: inserted.length,
    modified: modifiedRows.length,
    removed: plan.deletes.length,
    reconciled: reconciledCount,
    migrated,
    skippedUnmapped,
    insertFailed,
    transfersPaired,
    status: cursorError ? 'error' : 'ok',
    error: cursorError,
  })
}

/**
 * Write one account_balance_snapshots row per mapped account for the current
 * month from Plaid's reported balances (see src/lib/plaid-balances.ts for the
 * exact anchoring semantics). Idempotent: upserts on (account_id, as_of_month),
 * so repeated syncs in a month just refresh the anchor. For a Plaid-linked
 * account the bank's figure is the truth, so it overwrites a hand-entered
 * snapshot for the same month. Never throws; logs and returns the row count.
 */
export async function upsertPlaidBalanceSnapshots(
  db: Db,
  item: Pick<PlaidItemRow, 'id' | 'household_id'>,
  plaidAccounts: AccountBase[],
  todayISO: string = torontoTodayISO(),
): Promise<number> {
  if (plaidAccounts.length === 0) return 0
  try {
    const { data: acctRows, error: acctErr } = await db
      .from('accounts')
      .select('id, plaid_account_id, type')
      .eq('household_id', item.household_id)
      .eq('plaid_item_id', item.id)
      .is('archived_at', null)
    if (acctErr) throw acctErr
    const byPlaidId = new Map<string, { id: string; type: AccountType }>()
    for (const a of acctRows ?? []) {
      if (a.plaid_account_id) byPlaidId.set(a.plaid_account_id as string, { id: a.id as string, type: a.type as AccountType })
    }
    const accounts: PlaidBalanceAccount[] = []
    for (const pa of plaidAccounts) {
      const local = byPlaidId.get(pa.account_id)
      if (!local) continue
      accounts.push({
        plaidAccountId: pa.account_id,
        localAccountId: local.id,
        type: local.type,
        balances: { current: pa.balances?.current ?? null, available: pa.balances?.available ?? null },
      })
    }
    if (accounts.length === 0) return 0

    // This month's rows for the mapped accounts, so the balance can be rolled
    // back to the 1st. The window filter itself lives in the pure function.
    const { data: txRows, error: txErr } = await db
      .from('transactions')
      .select('account_id, occurred_on, amount_cents')
      .eq('household_id', item.household_id)
      .in(
        'account_id',
        accounts.map((a) => a.localAccountId),
      )
      .gte('occurred_on', monthOfISO(todayISO))
      .lte('occurred_on', todayISO)
      .limit(10000)
    if (txErr) throw txErr
    const txByAccount = new Map<string, { occurred_on: string; amount_cents: number }[]>()
    for (const t of txRows ?? []) {
      const id = t.account_id as string
      const list = txByAccount.get(id) ?? []
      list.push({ occurred_on: t.occurred_on as string, amount_cents: Number(t.amount_cents) })
      txByAccount.set(id, list)
    }

    const rows = snapshotsFromPlaidBalances(accounts, todayISO, txByAccount)
    if (rows.length === 0) return 0
    const { error } = await db.from('account_balance_snapshots').upsert(
      rows.map((r) => ({ ...r, household_id: item.household_id })),
      { onConflict: 'account_id,as_of_month' },
    )
    if (error) throw error
    return rows.length
  } catch (err) {
    console.error('[plaid-sync] balance snapshot write failed', {
      item: item.id,
      msg: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

/**
 * Real-time balances via /accounts/balance/get (the sync response's balances
 * may be cached) for every account of an item, written as snapshots. Used
 * right after linking so the balance sheet is right before the first
 * transaction ever lands. Best-effort; never throws.
 */
export async function refreshPlaidBalances(
  db: Db,
  plaid: PlaidApi,
  item: Pick<PlaidItemRow, 'id' | 'household_id'>,
): Promise<number> {
  try {
    const { data: secret } = await db
      .from('plaid_item_secrets')
      .select('access_token_encrypted')
      .eq('item_id', item.id)
      .maybeSingle()
    if (!secret?.access_token_encrypted) return 0
    const accessToken = decryptToken(secret.access_token_encrypted as string)
    const resp = await plaid.accountsBalanceGet({ access_token: accessToken })
    return await upsertPlaidBalanceSnapshots(db, item, resp.data.accounts)
  } catch (err) {
    console.error('[plaid-sync] balance refresh failed', {
      item: item.id,
      code: plaidErrorCode(err),
      msg: err instanceof Error ? err.message : String(err),
    })
    return 0
  }
}

/**
 * The bank changed the amount on a row we already hold. Single split follows
 * it; a manual multi-split or any shares mean someone's numbers no longer add
 * up, so flag the row for review instead of guessing.
 */
async function applyAmountChange(db: Db, householdId: string, txId: string, newAmount: number): Promise<void> {
  const [{ data: splits }, { count: shareCount }] = await Promise.all([
    db.from('transaction_splits').select('id, amount_cents').eq('transaction_id', txId).eq('household_id', householdId),
    // Only hand-entered shares need a human; rule shares are recomputed.
    db.from('transaction_shares').select('id', { count: 'exact', head: true }).eq('transaction_id', txId).is('rule_id', null),
  ])
  const splitPlan = planSplitUpdate(
    (splits ?? []).map((s) => ({ id: s.id as string, amount_cents: Number(s.amount_cents) })),
    newAmount,
  )
  let needsReview = (shareCount ?? 0) > 0
  if (splitPlan.kind === 'set-single') {
    await db.from('transaction_splits').update({ amount_cents: splitPlan.amount_cents }).eq('id', splitPlan.id)
  } else if (splitPlan.kind === 'flag-review') {
    needsReview = true
  }
  if (needsReview) await db.from('transactions').update({ needs_review: true }).eq('id', txId)
}

function itemStatusFor(status: PlaidSyncStatus): string | null {
  switch (status) {
    case 'ok':
    case 'transient':
      return 'active'
    case 'login_required':
      return null // already set precisely (login_required | pending_disconnect) by the caller
    case 'revoked':
      return 'revoked'
    case 'error':
      return 'error'
    case 'skipped_locked':
      return null
  }
}

// Stamp the item, release the lease, write a sync-log row, return the result.
async function finish(db: Db, item: PlaidItemRow, trigger: SyncTrigger, result: PlaidSyncResult): Promise<PlaidSyncResult> {
  const status = itemStatusFor(result.status)
  await db
    .from('plaid_items')
    .update({
      last_synced_at: new Date().toISOString(),
      sync_lease_until: null,
      ...(status ? { status } : {}),
      error_detail: result.status === 'transient' ? undefined : (result.error ?? null),
    })
    .eq('id', item.id)
  await log(db, item, trigger, result)
  return result
}

async function log(db: Db, item: PlaidItemRow, trigger: SyncTrigger, result: PlaidSyncResult): Promise<void> {
  await db.from('plaid_sync_log').insert({
    household_id: item.household_id,
    item_id: item.id,
    added: result.added,
    modified: result.modified,
    removed: result.removed,
    reconciled: result.reconciled,
    skipped_unmapped: result.skippedUnmapped,
    insert_failed: result.insertFailed,
    trigger,
    status: result.status,
    error_detail: result.error ?? null,
  })
}

/** When any of these accounts last had a balance snapshot written or refreshed. */
export async function latestSnapshotUpdatedAt(db: Db, accountIds: string[]): Promise<string | null> {
  if (accountIds.length === 0) return null
  const { data } = await db
    .from('account_balance_snapshots')
    .select('updated_at')
    .in('account_id', accountIds)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data?.updated_at as string | undefined) ?? null
}
