import type { RemovedTransaction, Transaction } from 'plaid'

/**
 * Pure decisions for the Plaid sync. No I/O, so every branch is unit-tested;
 * src/lib/plaid-sync.ts only applies what these functions decide.
 */

// ─── Batch planning ────────────────────────────────────────────────────────

export type SyncPlan = {
  /** A posted transaction whose pending counterpart we already hold → update in place. */
  migrations: { pendingId: string; posted: Transaction }[]
  /** Genuinely new rows. */
  inserts: Transaction[]
  /** Plaid `modified` rows. */
  updates: Transaction[]
  /** Plaid transaction_ids to delete (removed minus the migrated pending ids). */
  deletes: string[]
}

/**
 * Pair each `added` posted transaction with the `removed` pending id it
 * supersedes (Plaid sends both halves, usually in the same batch). Everything
 * else is a plain insert / update / delete.
 */
export function planSyncBatch(input: {
  added: Transaction[]
  modified: Transaction[]
  removed: RemovedTransaction[]
}): SyncPlan {
  const removedIds = new Set(
    input.removed.map((r) => r.transaction_id).filter((x): x is string => typeof x === 'string' && x.length > 0),
  )

  const migrations: SyncPlan['migrations'] = []
  const inserts: Transaction[] = []
  const claimed = new Set<string>()

  for (const t of input.added) {
    const pid = t.pending_transaction_id
    if (pid && removedIds.has(pid) && !claimed.has(pid)) {
      claimed.add(pid)
      migrations.push({ pendingId: pid, posted: t })
    } else {
      inserts.push(t)
    }
  }

  return {
    migrations,
    inserts,
    updates: input.modified,
    deletes: Array.from(removedIds).filter((id) => !claimed.has(id)),
  }
}

// ─── Split updates when the amount changes ─────────────────────────────────

export type SplitUpdatePlan =
  | { kind: 'set-single'; id: string; amount_cents: number }
  | { kind: 'noop' }
  | { kind: 'flag-review' }

/**
 * One split → it simply follows the transaction amount. Several splits that
 * already sum to the new amount → nothing to do. Otherwise the user's manual
 * split no longer adds up and we refuse to guess: flag for review.
 */
export function planSplitUpdate(
  splits: { id: string; amount_cents: number }[],
  newAmount: number,
): SplitUpdatePlan {
  if (splits.length === 0) return { kind: 'noop' }
  if (splits.length === 1) {
    return splits[0].amount_cents === newAmount
      ? { kind: 'noop' }
      : { kind: 'set-single', id: splits[0].id, amount_cents: newAmount }
  }
  const sum = splits.reduce((acc, s) => acc + s.amount_cents, 0)
  return sum === newAmount ? { kind: 'noop' } : { kind: 'flag-review' }
}

// ─── Error classification ──────────────────────────────────────────────────

export type PlaidErrorClass = 'reauth' | 'revoked' | 'transient' | 'fatal'

const REAUTH = new Set([
  'ITEM_LOGIN_REQUIRED',
  'INVALID_CREDENTIALS',
  'INVALID_MFA',
  'ITEM_LOCKED',
  'USER_SETUP_REQUIRED',
  'INSUFFICIENT_CREDENTIALS',
  'INVALID_UPDATED_USERNAME',
  'ACCESS_NOT_GRANTED',
  'PENDING_DISCONNECT',
])

const REVOKED = new Set(['USER_PERMISSION_REVOKED', 'ITEM_NOT_FOUND', 'ITEM_NO_LONGER_SUPPORTED'])

const TRANSIENT = new Set([
  'INSTITUTION_DOWN',
  'INSTITUTION_NOT_RESPONDING',
  'INSTITUTION_NOT_AVAILABLE',
  'PRODUCT_NOT_READY',
  'RATE_LIMIT_EXCEEDED',
  'INTERNAL_SERVER_ERROR',
  'PLANNED_MAINTENANCE',
  'TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION',
])

export function classifyPlaidError(code: string | null | undefined): PlaidErrorClass {
  if (!code) return 'fatal'
  if (REAUTH.has(code)) return 'reauth'
  if (REVOKED.has(code)) return 'revoked'
  if (TRANSIENT.has(code)) return 'transient'
  return 'fatal'
}

/** Plaid surfaces errors as Axios errors whose body carries error_code. */
export function plaidErrorCode(err: unknown): string | null {
  const body = (err as { response?: { data?: { error_code?: unknown } } })?.response?.data
  return typeof body?.error_code === 'string' ? body.error_code : null
}

export function isUniqueViolation(err: { code?: string | null } | null | undefined): boolean {
  return err?.code === '23505'
}

/** Cursor persistence must be all-or-nothing; a CAS miss means another run moved it. */
export function isSameCursor(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

// ─── Which items a sync run targets ────────────────────────────────────────

export type PlaidSyncSelection = { byId: string } | { statuses: string[] }

/**
 * A single item (a "Sync now" tap on one bank, or the sync that follows
 * re-authentication) is synced whatever its current status - that status is
 * exactly what the sync is trying to clear, so filtering it out would make
 * the item impossible to ever recover. Only the bulk "sync everything" path
 * (no item given) restricts itself to items still healthy enough to be worth
 * trying automatically.
 */
export function plaidSyncSelection(itemRowId?: string | null): PlaidSyncSelection {
  if (itemRowId) return { byId: itemRowId }
  return { statuses: ['active', 'error'] }
}

// ─── When a sync may make a live balance call ───────────────────────────────

/**
 * /transactions/sync pages normally carry the item's accounts with balances;
 * only when they did not (sandbox, some institutions) is a live
 * /accounts/balance/get worth making - and only if at least one account is
 * mapped, because with nothing mapped there is nothing to write and the live
 * call is exactly what provokes a fresh login demand at MFA banks.
 */
export const BALANCE_REFRESH_MIN_MS = 20 * 60 * 60 * 1000

export function shouldRefreshBalancesLive(
  mappedAccounts: number,
  snapshotsWritten: number,
  lastSnapshotUpdatedISO: string | null = null,
  now: number = Date.now(),
): boolean {
  if (mappedAccounts === 0 || snapshotsWritten > 0) return false
  if (!lastSnapshotUpdatedISO) return true
  const t = Date.parse(lastSnapshotUpdatedISO)
  // At most one live balance call per item per ~day: each one is a fresh
  // login at the bank, and at MFA banks that is what trips ITEM_LOGIN_REQUIRED.
  return !Number.isFinite(t) || now - t >= BALANCE_REFRESH_MIN_MS
}

// ─── Item status from Plaid's own view of the item ─────────────────────────

export type PlaidItemStatus = 'active' | 'login_required' | 'pending_disconnect' | 'revoked' | 'error'

/**
 * Plaid's `item.error.error_code` (from /item/get, or the body of an
 * ITEM: ERROR webhook) → the status we store. No error means healthy; a
 * transient institution problem is not a reason to ask the user for anything.
 */
export function statusFromItemError(code: string | null | undefined): PlaidItemStatus {
  if (!code) return 'active'
  if (code === 'PENDING_DISCONNECT') return 'pending_disconnect'
  switch (classifyPlaidError(code)) {
    case 'reauth':
      return 'login_required'
    case 'revoked':
      return 'revoked'
    case 'transient':
      return 'active'
    default:
      return 'error'
  }
}

/** plaid_sync_log.status is constrained; fold item statuses onto it. */
export function logStatusFor(status: PlaidItemStatus): 'ok' | 'login_required' | 'revoked' | 'error' {
  switch (status) {
    case 'active':
      return 'ok'
    case 'login_required':
    case 'pending_disconnect':
      return 'login_required'
    case 'revoked':
      return 'revoked'
    default:
      return 'error'
  }
}

/** Days before consent expiry at which a bank counts as needing the user. */
export const CONSENT_EXPIRY_WARNING_MS = 7 * 24 * 60 * 60 * 1000

/** Consent expiring within the warning window is a re-auth in waiting. */
export function consentExpiringSoon(consentExpirationISO: string | null | undefined, now: number = Date.now()): boolean {
  if (!consentExpirationISO) return false
  const t = Date.parse(consentExpirationISO)
  return Number.isFinite(t) && t - now < CONSENT_EXPIRY_WARNING_MS
}
