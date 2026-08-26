'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { ACCOUNT_TYPES, type AccountType } from '@/lib/domain'
import { humanizeDbError } from '@/lib/errors'

export type FirstAccountState = { error: string } | undefined

const TYPES = new Set<AccountType>(ACCOUNT_TYPES.map((t) => t.value))

/**
 * Onboarding step 2: create the household's first account. Same insert shape
 * as accounts/actions.ts `createAccount`, with the ownership defaulted to
 * `shared` (a one-member household has nobody else to assign it to yet) and
 * no last-four routing hint. Lands on the dashboard on success.
 */
export async function createFirstAccount(
  _prev: FirstAccountState,
  fd: FormData,
): Promise<FirstAccountState> {
  const name = String(fd.get('name') ?? '').trim().slice(0, 80)
  const type = String(fd.get('type') ?? '') as AccountType
  // MoneyInput posts integer cents in a hidden field; empty means the typed
  // text failed to parse (the input shows its own error), blank/0 means zero.
  const centsRaw = String(fd.get('opening_balance_cents') ?? '').trim()
  const opening_balance_cents = centsRaw === '' ? 0 : Number(centsRaw)

  if (!name) return { error: 'Give the account a name.' }
  if (!TYPES.has(type)) return { error: 'Pick an account type.' }
  if (!Number.isSafeInteger(opening_balance_cents)) {
    return { error: 'Starting balance must be a valid amount.' }
  }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { error } = await supabase.from('accounts').insert({
    household_id: ctx.householdId,
    name,
    type,
    ownership: 'shared',
    member_id: null,
    opening_balance_cents,
    last_four: null,
  })
  if (error) return { error: humanizeDbError(error, { entity: 'account name' }) }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
