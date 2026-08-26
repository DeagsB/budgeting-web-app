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
  opening_balance_cents: number
  last_four: string | null
}

type ParseResult = { error: string; ok?: never } | { ok: AccountInput; error?: never }

function parseForm(fd: FormData): ParseResult {
  const name = String(fd.get('name') ?? '').trim().slice(0, 80)
  const type = String(fd.get('type') ?? '') as AccountType
  const ownership = String(fd.get('ownership') ?? '') as AccountOwnership
  const memberRaw = String(fd.get('member_id') ?? '').trim()
  const openingRaw = String(fd.get('opening_balance') ?? '0')
  const member_id = memberRaw || null
  const opening_balance_cents = parseMoneyToCents(openingRaw) ?? 0
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
    return { error: 'Pick a member for a member-owned account.' }
  }

  return { ok: { name, type, ownership, member_id, opening_balance_cents, last_four } }
}

export async function createAccount(_prev: AccountState, fd: FormData): Promise<AccountState> {
  const parsed = parseForm(fd)
  if (!parsed.ok) return { error: parsed.error }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

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

  const parsed = parseForm(fd)
  if (!parsed.ok) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

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
