'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getHouseholdContext } from '@/lib/household'
import {
  createPlaidClient,
  plaidCountryCodes,
  PLAID_MAX_ITEMS,
  plaidProducts,
  encryptToken,
  decryptToken,
} from '@/lib/plaid'
import { refreshPlaidBalances, syncPlaidItem, type SyncTrigger } from '@/lib/plaid-sync'
import { getPlaidEnv } from '@/lib/env'
import type { AccountType } from '@/lib/domain'
import { humanizeDbError } from '@/lib/errors'

const MAX_ITEMS = PLAID_MAX_ITEMS

// ─── Shared types (client ↔ server) ───────────────────────────────────────

export type LinkTokenState = { ok: true; linkToken: string } | { error: string } | undefined

export type PlaidAccountChoice = {
  plaid_account_id: string
  name: string
  mask: string | null
  type: string
  subtype: string | null
  suggestedType: AccountType
}

export type ExchangeState =
  | { ok: true; itemRowId: string; accounts: PlaidAccountChoice[] }
  | { error: string }
  | undefined

export type AccountMapping = {
  plaid_account_id: string
  name: string
  mask: string | null
  suggestedType: AccountType
  target:
    | { kind: 'existing'; accountId: string }
    | { kind: 'create'; type: AccountType; ownership: 'member' | 'shared' }
    | { kind: 'skip' }
}

export type MapState = { ok: true } | { error: string } | undefined
export type PlaidSyncNowState =
  | { ok: true; added: number; reconciled: number; loginRequired: boolean; skipped: boolean }
  | { error: string }
  | undefined

export type RefreshAccountsState =
  | { ok: true; accounts: PlaidAccountChoice[] }
  | { error: string }
  | undefined

// Map a Plaid account type/subtype onto Maple's account_type enum.
function plaidSubtypeToAccountType(type: string, subtype: string | null): AccountType {
  const s = (subtype ?? '').toLowerCase()
  if (s === 'checking') return 'chequing'
  if (s === 'savings') return 'savings'
  if (type === 'credit' || s === 'credit card') return 'credit_card'
  if (type === 'loan') return 'loan'
  if (type === 'investment') return 'taxable_investment'
  return 'chequing'
}

async function webhookUrl(): Promise<string | undefined> {
  if (process.env.PLAID_WEBHOOK_URL) return process.env.PLAID_WEBHOOK_URL
  // Production must register an explicit URL (validated at boot); deriving it
  // from request headers would let a spoofed Host register an attacker's URL.
  if (getPlaidEnv() === 'production') return undefined
  // Sandbox/dev convenience: derive from the request host (tunnel-friendly).
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host')
  return host ? `${proto}://${host}/api/plaid/webhook` : undefined
}

// OAuth-only institutions (most major Canadian banks - RBC, TD, Scotia…) require
// a redirect_uri that the user is sent back to after authenticating on the bank's
// own site. The value MUST exactly match an "Allowed redirect URI" registered in
// the Plaid dashboard (Developers → API). We gate on the env var: if it isn't set
// we omit redirect_uri entirely, which keeps non-OAuth (credential) banks working
// and avoids the INVALID_FIELD error Plaid throws for an unregistered URI.
function redirectUri(): string | undefined {
  return process.env.PLAID_REDIRECT_URI || undefined
}

// ─── Link token ───────────────────────────────────────────────────────────

export async function createLinkToken(): Promise<LinkTokenState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const plaid = createPlaidClient()
  if (!plaid) return { error: 'Plaid isn’t configured on this server.' }

  const supabase = await createClient()
  const { count } = await supabase
    .from('plaid_items')
    .select('id', { count: 'exact', head: true })
    .eq('household_id', ctx.householdId)
    .neq('status', 'removed')
  if ((count ?? 0) >= MAX_ITEMS) {
    return { error: `You’ve linked the maximum of ${MAX_ITEMS} banks (Plaid free tier).` }
  }

  try {
    const resp = await plaid.linkTokenCreate({
      user: { client_user_id: ctx.householdId },
      client_name: 'Maple',
      products: plaidProducts(),
      country_codes: plaidCountryCodes(),
      language: 'en',
      webhook: await webhookUrl(),
      redirect_uri: redirectUri(),
    })
    return { ok: true, linkToken: resp.data.link_token }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not start Plaid.' }
  }
}

export async function createUpdateLinkToken(itemRowId: string): Promise<LinkTokenState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const plaid = createPlaidClient()
  if (!plaid) return { error: 'Plaid isn’t configured on this server.' }
  const service = createServiceClient()
  if (!service) return { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }

  // Confirm the item belongs to this household, then read its token (service).
  const supabase = await createClient()
  const { data: item } = await supabase
    .from('plaid_items')
    .select('id')
    .eq('id', itemRowId)
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (!item) return { error: 'Bank not found.' }

  const { data: secret } = await service
    .from('plaid_item_secrets')
    .select('access_token_encrypted')
    .eq('item_id', itemRowId)
    .maybeSingle()
  if (!secret?.access_token_encrypted) return { error: 'Missing access token.' }

  try {
    const resp = await plaid.linkTokenCreate({
      user: { client_user_id: ctx.householdId },
      client_name: 'Maple',
      country_codes: plaidCountryCodes(),
      language: 'en',
      access_token: decryptToken(secret.access_token_encrypted as string),
      webhook: await webhookUrl(),
      redirect_uri: redirectUri(),
    })
    return { ok: true, linkToken: resp.data.link_token }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not start re-authentication.' }
  }
}

// ─── Exchange + persist item ───────────────────────────────────────────────

export async function exchangePublicToken(
  publicToken: string,
  institution?: { name?: string | null; id?: string | null },
): Promise<ExchangeState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const plaid = createPlaidClient()
  if (!plaid) return { error: 'Plaid isn’t configured on this server.' }
  const service = createServiceClient()
  if (!service) return { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }

  try {
    const exchange = await plaid.itemPublicTokenExchange({ public_token: publicToken })
    const accessToken = exchange.data.access_token
    const plaidItemId = exchange.data.item_id

    // plaid_items is read-only for member sessions; the service role writes it
    // after the household check above (getHouseholdContext) has passed.
    const { data: itemRow, error: itemErr } = await service
      .from('plaid_items')
      .insert({
        household_id: ctx.householdId,
        item_id: plaidItemId,
        institution_name: institution?.name ?? null,
        institution_id: institution?.id ?? null,
        status: 'active',
      })
      .select('id')
      .single()
    if (itemErr || !itemRow) return { error: itemErr?.message ?? 'Could not save the bank.' }

    // Token in the policy-less secrets table (service-role only), encrypted.
    const { error: secretErr } = await service.from('plaid_item_secrets').insert({
      item_id: itemRow.id,
      access_token_encrypted: encryptToken(accessToken),
    })
    if (secretErr) {
      // Roll back the orphan item so the user can retry cleanly.
      await service.from('plaid_items').delete().eq('id', itemRow.id)
      return { error: secretErr.message }
    }

    const accountsResp = await plaid.accountsGet({ access_token: accessToken })
    const accounts: PlaidAccountChoice[] = accountsResp.data.accounts.map((a) => ({
      plaid_account_id: a.account_id,
      name: a.name,
      mask: a.mask ?? null,
      type: String(a.type),
      subtype: a.subtype ? String(a.subtype) : null,
      suggestedType: plaidSubtypeToAccountType(String(a.type), a.subtype ? String(a.subtype) : null),
    }))

    revalidatePath('/transactions/import/plaid-setup')
    return { ok: true, itemRowId: itemRow.id, accounts }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not connect the bank.' }
  }
}

// ─── Map Plaid accounts → Maple accounts, then initial sync ────────────────

export async function saveAccountMapping(
  itemRowId: string,
  mappings: AccountMapping[],
): Promise<MapState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()

  const { data: item } = await supabase
    .from('plaid_items')
    .select('id')
    .eq('id', itemRowId)
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (!item) return { error: 'Bank not found.' }

  for (const m of mappings) {
    const last_four = m.mask && /^\d{4}$/.test(m.mask) ? m.mask : null
    if (m.target.kind === 'skip') continue

    if (m.target.kind === 'existing') {
      const { error } = await supabase
        .from('accounts')
        .update({ plaid_account_id: m.plaid_account_id, plaid_item_id: itemRowId })
        .eq('id', m.target.accountId)
        .eq('household_id', ctx.householdId)
      if (error) return { error: humanizeDbError(error, { entity: 'account name' }) }
    } else {
      // A "Mine" account belongs to the signed-in member; joint accounts have no owner.
      if (m.target.ownership === 'member' && !ctx.memberId) {
        return { error: 'Pick which member you are in Setup before creating an account of your own.' }
      }
      const { error } = await supabase.from('accounts').insert({
        household_id: ctx.householdId,
        name: m.name.slice(0, 80) || 'Account',
        type: m.target.type,
        ownership: m.target.ownership,
        member_id: m.target.ownership === 'member' ? ctx.memberId : null,
        opening_balance_cents: 0,
        last_four,
        plaid_account_id: m.plaid_account_id,
        plaid_item_id: itemRowId,
      })
      if (error) return { error: humanizeDbError(error, { entity: 'account name' }) }
    }
  }

  // Initial pull so transactions land immediately.
  await triggerPlaidSync(itemRowId)

  // Anchor every mapped account on the bank's real-time balance. The sync
  // above already wrote snapshots from its (possibly cached) balances, but
  // only for accounts that carried transactions; /accounts/balance/get covers
  // the rest and is fresher. Best-effort.
  const plaid = createPlaidClient()
  const service = createServiceClient()
  if (plaid && service) {
    await refreshPlaidBalances(service, plaid, { id: itemRowId, household_id: ctx.householdId })
  }

  revalidatePath('/transactions/import/plaid-setup')
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/accounts')
  revalidatePath('/balance-sheet')
  return { ok: true }
}

// ─── Disconnect ─────────────────────────────────────────────────────────────

export async function disconnectItem(itemRowId: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const supabase = await createClient()
  const service = createServiceClient()

  const { data: item } = await supabase
    .from('plaid_items')
    .select('id')
    .eq('id', itemRowId)
    .eq('household_id', ctx.householdId)
    .maybeSingle()
  if (!item) return { error: 'Bank not found.' }

  // Best-effort: tell Plaid to forget the item so it stops billing/syncing.
  const plaid = createPlaidClient()
  if (plaid && service) {
    const { data: secret } = await service
      .from('plaid_item_secrets')
      .select('access_token_encrypted')
      .eq('item_id', itemRowId)
      .maybeSingle()
    if (secret?.access_token_encrypted) {
      try {
        await plaid.itemRemove({ access_token: decryptToken(secret.access_token_encrypted as string) })
      } catch {
        /* removing on Plaid's side is best-effort */
      }
    }
  }

  // Drop the token, keep the accounts + their history (just unlink them).
  if (service) await service.from('plaid_item_secrets').delete().eq('item_id', itemRowId)
  await supabase
    .from('accounts')
    .update({ plaid_account_id: null, plaid_item_id: null })
    .eq('plaid_item_id', itemRowId)
    .eq('household_id', ctx.householdId)
  if (!service) return { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }
  await service
    .from('plaid_items')
    .update({ status: 'removed', error_detail: null, needs_account_review: false })
    .eq('id', itemRowId)
    .eq('household_id', ctx.householdId)

  revalidatePath('/transactions/import/plaid-setup')
  return { ok: true }
}

// ─── New accounts at an already-linked bank ─────────────────────────────────

/**
 * Plaid's NEW_ACCOUNTS_AVAILABLE flags an item; this fetches the item's
 * accounts and returns the ones not yet mapped so the wizard can reuse the
 * mapping step. Clears the flag once the user has seen them.
 */
export async function refreshItemAccounts(itemRowId: string): Promise<RefreshAccountsState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const plaid = createPlaidClient()
  if (!plaid) return { error: 'Plaid isn’t configured on this server.' }
  const service = createServiceClient()
  if (!service) return { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }

  const supabase = await createClient()
  const [{ data: item }, { data: mapped }] = await Promise.all([
    supabase.from('plaid_items').select('id').eq('id', itemRowId).eq('household_id', ctx.householdId).maybeSingle(),
    supabase.from('accounts').select('plaid_account_id').eq('plaid_item_id', itemRowId).eq('household_id', ctx.householdId),
  ])
  if (!item) return { error: 'Bank not found.' }

  const { data: secret } = await service
    .from('plaid_item_secrets')
    .select('access_token_encrypted')
    .eq('item_id', itemRowId)
    .maybeSingle()
  if (!secret?.access_token_encrypted) return { error: 'Missing access token. Reconnect the bank.' }

  try {
    const already = new Set((mapped ?? []).map((a) => a.plaid_account_id as string | null).filter(Boolean))
    const resp = await plaid.accountsGet({ access_token: decryptToken(secret.access_token_encrypted as string) })
    const accounts: PlaidAccountChoice[] = resp.data.accounts
      .filter((a) => !already.has(a.account_id))
      .map((a) => ({
        plaid_account_id: a.account_id,
        name: a.name,
        mask: a.mask ?? null,
        type: String(a.type),
        subtype: a.subtype ? String(a.subtype) : null,
        suggestedType: plaidSubtypeToAccountType(String(a.type), a.subtype ? String(a.subtype) : null),
      }))
    await service.from('plaid_items').update({ needs_account_review: false }).eq('id', itemRowId)
    revalidatePath('/transactions/import/plaid-setup')
    return { ok: true, accounts }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not load accounts.' }
  }
}

// ─── Manual "Sync now" ──────────────────────────────────────────────────────

/**
 * Sync one item or every syncable item in the household. `minIntervalMs`
 * (used by pull-to-refresh) skips items synced more recently than that so the
 * gesture cannot hammer Plaid; the pull path also treats "nothing linked" as a
 * quiet no-op rather than an error.
 */
export async function triggerPlaidSync(
  itemRowId?: string,
  opts: { trigger?: Exclude<SyncTrigger, 'webhook' | 'cron'>; minIntervalMs?: number } = {},
): Promise<PlaidSyncNowState> {
  const trigger = opts.trigger ?? 'manual'
  const quiet = trigger === 'pull'
  const noop: PlaidSyncNowState = { ok: true, added: 0, reconciled: 0, loginRequired: false, skipped: true }

  const ctx = await getHouseholdContext()
  if (!ctx) return quiet ? noop : { error: 'Not authorized.' }
  const plaid = createPlaidClient()
  if (!plaid) return quiet ? noop : { error: 'Plaid isn’t configured on this server.' }
  const service = createServiceClient()
  if (!service) return { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }

  let query = service
    .from('plaid_items')
    .select('id, household_id, item_id, cursor, status, last_synced_at')
    .eq('household_id', ctx.householdId)
    .in('status', ['active', 'error'])
  if (itemRowId) query = query.eq('id', itemRowId)
  const { data: items } = await query
  if (!items || items.length === 0) return quiet ? noop : { error: 'No connected banks to sync.' }

  const cutoff = opts.minIntervalMs ? Date.now() - opts.minIntervalMs : null
  let added = 0
  let reconciled = 0
  let loginRequired = false
  let ran = 0
  for (const it of items) {
    const last = it.last_synced_at ? Date.parse(it.last_synced_at as string) : 0
    if (cutoff !== null && last > cutoff) continue
    ran += 1
    const res = await syncPlaidItem(
      service,
      plaid,
      {
        id: it.id as string,
        household_id: it.household_id as string,
        item_id: it.item_id as string,
        cursor: (it.cursor as string | null) ?? null,
      },
      { trigger },
    )
    added += res.added
    reconciled += res.reconciled
    if (res.status === 'login_required') loginRequired = true
  }

  revalidatePath('/transactions/import/plaid-setup')
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  return { ok: true, added, reconciled, loginRequired, skipped: ran === 0 }
}
