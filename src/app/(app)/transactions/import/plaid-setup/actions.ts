'use server'

import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getHouseholdContext } from '@/lib/household'
import {
  createPlaidClient,
  plaidCountryCodes,
  plaidProducts,
  encryptToken,
  decryptToken,
} from '@/lib/plaid'
import { syncPlaidItem } from '@/lib/plaid-sync'
import type { AccountType } from '@/lib/domain'

const MAX_ITEMS = 10 // Plaid free Trial tier cap.

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
    | { kind: 'create'; type: AccountType; ownership: 'member' | 'shared'; memberId: string | null }
    | { kind: 'skip' }
}

export type MapState = { ok: true } | { error: string } | undefined
export type PlaidSyncNowState =
  | { ok: true; added: number; reconciled: number; loginRequired: boolean }
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
  // Derive from the request host (parallels the email test-webhook helper).
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host = h.get('x-forwarded-host') ?? h.get('host')
  return host ? `${proto}://${host}/api/plaid/webhook` : undefined
}

// OAuth-only institutions (most major Canadian banks — RBC, TD, Scotia…) require
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

    const supabase = await createClient()
    const { data: itemRow, error: itemErr } = await supabase
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
      await supabase.from('plaid_items').delete().eq('id', itemRow.id)
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
      if (error) return { error: error.message }
    } else {
      const { error } = await supabase.from('accounts').insert({
        household_id: ctx.householdId,
        name: m.name.slice(0, 80) || 'Account',
        type: m.target.type,
        ownership: m.target.ownership,
        member_id: m.target.ownership === 'member' ? m.target.memberId : null,
        opening_balance_cents: 0,
        last_four,
        plaid_account_id: m.plaid_account_id,
        plaid_item_id: itemRowId,
      })
      if (error) return { error: error.message }
    }
  }

  // Initial pull so transactions land immediately.
  await triggerPlaidSync(itemRowId)
  revalidatePath('/transactions/import/plaid-setup')
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
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
  await supabase
    .from('plaid_items')
    .update({ status: 'removed', error_detail: null })
    .eq('id', itemRowId)
    .eq('household_id', ctx.householdId)

  revalidatePath('/transactions/import/plaid-setup')
  return { ok: true }
}

// ─── Manual "Sync now" ──────────────────────────────────────────────────────

export async function triggerPlaidSync(itemRowId?: string): Promise<PlaidSyncNowState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }
  const plaid = createPlaidClient()
  if (!plaid) return { error: 'Plaid isn’t configured on this server.' }
  const service = createServiceClient()
  if (!service) return { error: 'Server is missing SUPABASE_SERVICE_ROLE_KEY.' }

  let query = service
    .from('plaid_items')
    .select('id, household_id, item_id, cursor')
    .eq('household_id', ctx.householdId)
    .neq('status', 'removed')
  if (itemRowId) query = query.eq('id', itemRowId)
  const { data: items } = await query
  if (!items || items.length === 0) return { error: 'No connected banks to sync.' }

  let added = 0
  let reconciled = 0
  let loginRequired = false
  for (const it of items) {
    const res = await syncPlaidItem(service, plaid, {
      id: it.id as string,
      household_id: it.household_id as string,
      item_id: it.item_id as string,
      cursor: (it.cursor as string | null) ?? null,
    })
    added += res.added
    reconciled += res.reconciled
    if (res.status === 'login_required') loginRequired = true
  }

  revalidatePath('/transactions/import/plaid-setup')
  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  return { ok: true, added, reconciled, loginRequired }
}
