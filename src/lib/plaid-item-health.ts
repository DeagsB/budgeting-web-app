import type { SupabaseClient } from '@supabase/supabase-js'
import type { PlaidApi } from 'plaid'
import { decryptToken } from '@/lib/plaid'
import {
  classifyPlaidError,
  consentExpiringSoon,
  logStatusFor,
  plaidErrorCode,
  statusFromItemError,
  type PlaidItemStatus,
} from '@/lib/plaid-sync-plan'

type Db = SupabaseClient

/** Who asked for the check; folded onto plaid_sync_log.trigger, which is constrained. */
export type HealthSource = 'webhook' | 'reauth' | 'cron' | 'manual'

export type ItemRef = { id: string; household_id: string; status?: string | null }

export type ItemHealth =
  | { reachable: true; status: PlaidItemStatus; code: string | null }
  | { reachable: false; message: string }

/**
 * Ask Plaid what it thinks of the item right now. /item/get is answered from
 * Plaid's side - it never logs in at the bank - so it is safe to call as
 * often as we like and is the one source of truth for "does this bank still
 * need the user". Missing access token means the connection was revoked.
 */
export async function checkItemHealth(db: Db, plaid: PlaidApi, itemRowId: string): Promise<ItemHealth> {
  const { data: secret } = await db
    .from('plaid_item_secrets')
    .select('access_token_encrypted')
    .eq('item_id', itemRowId)
    .maybeSingle()
  if (!secret?.access_token_encrypted) return { reachable: true, status: 'revoked', code: 'MISSING_ACCESS_TOKEN' }

  let accessToken: string
  try {
    accessToken = decryptToken(secret.access_token_encrypted as string)
  } catch {
    return { reachable: false, message: 'Could not decrypt the access token (was PLAID_TOKEN_KEY rotated?).' }
  }

  try {
    const resp = await plaid.itemGet({ access_token: accessToken })
    const code = resp.data.item.error?.error_code ?? null
    if (!code && consentExpiringSoon(resp.data.item.consent_expiration_time)) {
      return { reachable: true, status: 'login_required', code: 'PENDING_EXPIRATION' }
    }
    return { reachable: true, status: statusFromItemError(code), code }
  } catch (err) {
    // /item/get itself failing with a sign-in or revocation code is an answer;
    // anything else (network, rate limit, Plaid down) is "ask again later".
    const code = plaidErrorCode(err)
    const cls = code ? classifyPlaidError(code) : 'fatal'
    if (code && (cls === 'reauth' || cls === 'revoked')) {
      return { reachable: true, status: statusFromItemError(code), code }
    }
    return { reachable: false, message: err instanceof Error ? err.message : 'Plaid did not answer.' }
  }
}

function triggerFor(source: HealthSource): 'webhook' | 'cron' | 'manual' {
  return source === 'webhook' ? 'webhook' : source === 'cron' ? 'cron' : 'manual'
}

/**
 * Make `plaid_items.status` agree with Plaid, and leave a log row saying who
 * asked and what changed. Every writer of the status goes through here except
 * the sync itself (which sees the bank's answer first-hand):
 * - a webhook's claim is checked before it is believed, so a late or
 *   out-of-order ITEM: ERROR cannot put a repaired bank back into "reconnect";
 * - after re-authentication the real state is written before any sync runs;
 * - the daily cron re-checks every bank that is waiting on the user, so a
 *   status nobody cleared heals itself.
 * When Plaid cannot be reached the caller's `claimed` status (if any) is
 * applied, because a webhook that says "broken" is better evidence than
 * silence. A removed item is never touched.
 */
export async function reconcileItemStatus(
  db: Db,
  plaid: PlaidApi,
  item: ItemRef,
  opts: { source: HealthSource; detail?: string; claimed?: PlaidItemStatus | null },
): Promise<{ status: PlaidItemStatus | null; code: string | null; reachable: boolean; changed: boolean }> {
  const health = await checkItemHealth(db, plaid, item.id)
  const next: PlaidItemStatus | null = health.reachable ? health.status : (opts.claimed ?? null)
  const code = health.reachable ? health.code : (opts.detail ?? null)

  const { data: current } = await db.from('plaid_items').select('status').eq('id', item.id).maybeSingle()
  const before = (current?.status as string | undefined) ?? item.status ?? null

  let changed = false
  if (next && before !== 'removed' && before !== next) {
    const { error } = await db
      .from('plaid_items')
      .update({ status: next, error_detail: next === 'active' ? null : code })
      .eq('id', item.id)
    changed = !error
  }

  const outcome = health.reachable ? (health.code ?? 'ok') : `unreachable (${health.message})`
  await db.from('plaid_sync_log').insert({
    household_id: item.household_id,
    item_id: item.id,
    trigger: triggerFor(opts.source),
    status: next ? logStatusFor(next) : 'transient',
    error_detail: `${opts.source}${opts.detail ? `:${opts.detail}` : ''} -> ${outcome}${changed ? ` (${before} -> ${next})` : ''}`,
  })

  return { status: next, code, reachable: health.reachable, changed }
}
