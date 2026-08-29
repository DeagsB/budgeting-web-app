import type { SupabaseClient } from '@supabase/supabase-js'

/** Item statuses that mean "the bank stopped feeding us and the user must act". */
export const PLAID_ATTENTION_STATUSES = ['login_required', 'pending_disconnect', 'revoked', 'error'] as const
export type PlaidAttentionStatus = (typeof PLAID_ATTENTION_STATUSES)[number]

export type PlaidAttentionItem = {
  id: string
  institution_name: string | null
  status: PlaidAttentionStatus
  last_synced_at: string | null
}

/**
 * Linked banks in this household that need the user's attention (re-auth,
 * pending disconnect, revoked, or a hard sync error). Read through the caller's
 * own client so RLS applies; every member may see this.
 */
export async function getPlaidAttention(
  supabase: SupabaseClient,
  householdId: string,
): Promise<PlaidAttentionItem[]> {
  const { data } = await supabase
    .from('plaid_items')
    .select('id, institution_name, status, last_synced_at')
    .eq('household_id', householdId)
    .in('status', [...PLAID_ATTENTION_STATUSES])
    .order('institution_name')
  return ((data ?? []) as PlaidAttentionItem[]).filter((i) =>
    (PLAID_ATTENTION_STATUSES as readonly string[]).includes(i.status),
  )
}

/** Short, user-facing reason for one attention status. */
export function plaidAttentionReason(status: PlaidAttentionStatus): string {
  switch (status) {
    case 'login_required':
      return 'needs you to sign in again'
    case 'pending_disconnect':
      return 'is about to disconnect'
    case 'revoked':
      return 'was disconnected at the bank'
    case 'error':
      return 'stopped syncing'
  }
}

/** Where a one-tap "Reconnect" should send the user for a given item. */
export function plaidReconnectHref(itemId?: string): string {
  return itemId
    ? `/transactions/import/plaid-setup?reauth=${encodeURIComponent(itemId)}`
    : '/transactions/import/plaid-setup'
}
