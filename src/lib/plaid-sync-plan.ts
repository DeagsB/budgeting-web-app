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
