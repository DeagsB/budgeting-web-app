import type { SupabaseClient } from '@supabase/supabase-js'

/** Item statuses that mean "the bank stopped feeding us and the user must act". */
export const PLAID_ATTENTION_STATUSES = ['login_required', 'pending_disconnect', 'revoked', 'error'] as const
export type PlaidAttentionStatus = (typeof PLAID_ATTENTION_STATUSES)[number]

/**
 * What the user has to do about a linked bank:
 * - `reconnect`: the bank wants a fresh sign-in (or dropped the connection).
 * - `choose_accounts`: the bank is linked but no account was ever picked, so
 *   every synced transaction is skipped as unmapped and nothing shows up.
 */
export type PlaidAttentionKind = 'reconnect' | 'choose_accounts'

export type PlaidAttentionItem = {
  id: string
  institution_name: string | null
  status: string
  last_synced_at: string | null
  kind: PlaidAttentionKind
}

/** Pure: the attention an item needs, or null when it is healthy. */
export function plaidAttentionKind(
  item: { status: string },
  mappedAccounts: number,
): PlaidAttentionKind | null {
  if ((PLAID_ATTENTION_STATUSES as readonly string[]).includes(item.status)) return 'reconnect'
  if (item.status === 'removed') return null
  if (mappedAccounts === 0) return 'choose_accounts'
  return null
}

/**
 * Linked banks in this household that need the user's attention. Read
 * through the caller's own client so RLS applies; every member may see this.
 */
export async function getPlaidAttention(
  supabase: SupabaseClient,
  householdId: string,
): Promise<PlaidAttentionItem[]> {
  const [{ data: items }, { data: mapped }] = await Promise.all([
    supabase
      .from('plaid_items')
      .select('id, institution_name, status, last_synced_at')
      .eq('household_id', householdId)
      .neq('status', 'removed')
      .order('institution_name'),
    supabase
      .from('accounts')
      .select('plaid_item_id')
      .eq('household_id', householdId)
      .not('plaid_item_id', 'is', null)
      .is('archived_at', null),
  ])
  const mappedCount = new Map<string, number>()
  for (const a of mapped ?? []) {
    const id = a.plaid_item_id as string
    mappedCount.set(id, (mappedCount.get(id) ?? 0) + 1)
  }
  const out: PlaidAttentionItem[] = []
  for (const it of (items ?? []) as Array<Omit<PlaidAttentionItem, 'kind'>>) {
    const kind = plaidAttentionKind(it, mappedCount.get(it.id) ?? 0)
    if (kind) out.push({ ...it, kind })
  }
  return out
}

/** Short, user-facing reason for one attention status. */
export function plaidAttentionReason(status: string): string {
  switch (status) {
    case 'login_required':
      return 'needs you to sign in again'
    case 'pending_disconnect':
      return 'is about to disconnect'
    case 'revoked':
      return 'was disconnected at the bank'
    case 'error':
      return 'stopped syncing'
    default:
      return 'needs attention'
  }
}

/** Sentence fragment after the bank's name, e.g. "CIBC needs you to sign in again". */
export function plaidAttentionTitle(item: Pick<PlaidAttentionItem, 'kind' | 'status'>): string {
  return item.kind === 'choose_accounts'
    ? 'is linked but no accounts are tracked yet'
    : plaidAttentionReason(item.status)
}

/** Where a one-tap "Reconnect" should send the user for a given item. */
export function plaidReconnectHref(itemId?: string): string {
  return itemId
    ? `/transactions/import/plaid-setup?reauth=${encodeURIComponent(itemId)}`
    : '/transactions/import/plaid-setup'
}

/** The one tap that resolves an attention item. */
export function plaidAttentionAction(item: Pick<PlaidAttentionItem, 'id' | 'kind'>): { label: string; href: string } {
  return item.kind === 'choose_accounts'
    ? { label: 'Choose accounts', href: '/transactions/import/plaid-setup' }
    : { label: 'Reconnect', href: plaidReconnectHref(item.id) }
}
