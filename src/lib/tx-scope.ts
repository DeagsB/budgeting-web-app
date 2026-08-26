/**
 * Transaction scope for the list filter and the shared-with-me views.
 *
 * A login sees three kinds of money:
 *   - `mine`    : on an account it can see (own or joint) with no share rows
 *   - `shared`  : on an account it can see, split out to other members
 *   - `with-me` : paid by another member on an account it cannot see, visible
 *                 only because the caller holds a `transaction_shares` row
 *                 (read-only crossover; `tx_editable` in the DB excludes it)
 *
 * Classification is by editability + shares rather than by payer, because
 * ingest paths leave `member_id = null` on joint accounts.
 */
export type TxScope = 'mine' | 'shared' | 'with-me'

export const TX_SCOPES: { value: TxScope; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'shared', label: 'Shared' },
  { value: 'with-me', label: 'Shared with me' },
]

export function parseScope(raw: string | null | undefined): TxScope | null {
  return TX_SCOPES.some((s) => s.value === raw) ? (raw as TxScope) : null
}

export function scopeLabel(scope: TxScope | null | undefined): string | null {
  return TX_SCOPES.find((s) => s.value === scope)?.label ?? null
}

/**
 * Mirror of the `tx_editable` RLS helper: writable when the account is
 * visible to this login (own or joint) or the caller's own member paid.
 */
export function isTxEditable(a: {
  accountVisible: boolean
  payerId: string | null
  myMemberId: string | null
}): boolean {
  if (a.accountVisible) return true
  return a.payerId !== null && a.myMemberId !== null && a.payerId === a.myMemberId
}

export function classifyTx(a: { editable: boolean; shareCount: number }): TxScope {
  if (!a.editable) return 'with-me'
  return a.shareCount > 0 ? 'shared' : 'mine'
}

export type AccountOwnership = 'member' | 'shared'

/** Account ownership as shown to the signed-in member. */
export function ownershipLabel(ownership: AccountOwnership | string): 'Mine' | 'Joint' {
  return ownership === 'shared' ? 'Joint' : 'Mine'
}
