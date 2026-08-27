'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { ACCOUNT_TYPES, type AccountType } from '@/lib/domain'
import { humanizeDbError } from '@/lib/errors'

export type FirstAccountState = { error: string } | { ok: true } | undefined

const TYPES = new Set<AccountType>(ACCOUNT_TYPES.map((t) => t.value))

/**
 * Create an account by hand during onboarding. Same insert shape as
 * accounts/actions.ts `createAccount`, with no last-four routing hint.
 *
 * Ownership follows the track. The owner setting up a brand-new household has
 * nobody else to assign anything to, so their accounts start `shared`; someone
 * who joined by invitation is adding their own money to a household that
 * already has other people in it, so theirs starts private to them.
 *
 * Stays on the step on success so another account - or another bank - can be
 * added; the reader moves on with Continue.
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

  const mine = ctx.role !== 'owner' && ctx.memberId !== null

  const supabase = await createClient()
  const { error } = await supabase.from('accounts').insert({
    household_id: ctx.householdId,
    name,
    type,
    ownership: mine ? 'member' : 'shared',
    member_id: mine ? ctx.memberId : null,
    opening_balance_cents,
    last_four: null,
  })
  if (error) return { error: humanizeDbError(error, { entity: 'account name' }) }

  revalidatePath('/', 'layout')
  return { ok: true }
}
