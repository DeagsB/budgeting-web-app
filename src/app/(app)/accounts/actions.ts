'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP, type AccountType, type AccountOwnership } from '@/lib/domain'
import { humanizeDbError } from '@/lib/errors'

export type AccountState = { error: string } | undefined

const TYPES = new Set<AccountType>(ACCOUNT_TYPES.map((t) => t.value))
const OWNERSHIPS = new Set<AccountOwnership>(ACCOUNT_OWNERSHIP.map((o) => o.value))

type AccountInput = {
  name: string
  type: AccountType
  ownership: AccountOwnership
  member_id: string | null
  // Omitted (not just 0) when the caller's form didn't render the field at
  // all - a linked account hides opening balance entirely, and an update
  // must leave the stored value untouched rather than zeroing it out.
  opening_balance_cents?: number
  last_four: string | null
}

type ParseResult = { error: string; ok?: never } | { ok: AccountInput; error?: never }

/**
 * `myMemberId` is the signed-in member. A "Mine" account is always owned by
 * the caller; there is no picker for other members' accounts.
 */
function parseForm(fd: FormData, myMemberId: string | null): ParseResult {
  const name = String(fd.get('name') ?? '').trim().slice(0, 80)
  const type = String(fd.get('type') ?? '') as AccountType
  const ownership = String(fd.get('ownership') ?? '') as AccountOwnership
  const member_id = ownership === 'member' ? myMemberId : null

  // The opening balance field is absent entirely for a linked account's edit
  // form (task 1: opening balance is hidden for linked accounts) - treat
  // "field not submitted" as "leave the stored value alone", not "0".
  let opening_balance_cents: number | undefined
  if (fd.has('opening_balance')) {
    const openingRaw = String(fd.get('opening_balance') ?? '')
    const parsed = parseMoneyToCents(openingRaw)
    if (parsed === null) {
      return { error: 'Enter the opening balance as dollars and cents, e.g. 1234.56' }
    }
    opening_balance_cents = parsed
  }

  const lastFourRaw = String(fd.get('last_four') ?? '').trim()
  let last_four: string | null = null
  if (lastFourRaw) {
    if (!/^\d{4}$/.test(lastFourRaw)) {
      return { error: 'Last 4 digits must be exactly 4 digits.' }
    }
    last_four = lastFourRaw
  }

  if (!name) return { error: 'Name is required.' }
  if (!TYPES.has(type)) return { error: 'Invalid account type.' }
  if (!OWNERSHIPS.has(ownership)) return { error: "Couldn't save that. Refresh and try again." }
  if (ownership === 'member' && !member_id) {
    return { error: 'Pick which member you are in Setup before adding an account of your own.' }
  }

  return { ok: { name, type, ownership, member_id, opening_balance_cents, last_four } }
}

export async function createAccount(_prev: AccountState, fd: FormData): Promise<AccountState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const parsed = parseForm(fd, ctx.memberId)
  if (!parsed.ok) return { error: parsed.error }

  const supabase = await createClient()
  const { error } = await supabase.from('accounts').insert({
    household_id: ctx.householdId,
    ...parsed.ok,
  })
  if (error) return { error: humanizeDbError(error, { entity: 'account name' }) }

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
  return undefined
}

export async function updateAccount(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const parsed = parseForm(fd, ctx.memberId)
  if (!parsed.ok) return

  const supabase = await createClient()
  await supabase
    .from('accounts')
    .update(parsed.ok)
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}

export async function archiveAccount(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('accounts')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}

export async function unarchiveAccount(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('accounts')
    .update({ archived_at: null })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/accounts')
  revalidatePath('/dashboard')
}
