'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'

export type SettlementState = { error: string } | { ok: true } | undefined

export async function recordSettlement(
  _prev: SettlementState,
  fd: FormData,
): Promise<SettlementState> {
  const from_member_id = String(fd.get('from_member_id') ?? '')
  const to_member_id = String(fd.get('to_member_id') ?? '')
  const settled_on = String(fd.get('settled_on') ?? '')
  const amount = parseMoneyToCents(String(fd.get('amount') ?? ''))
  const note = String(fd.get('note') ?? '').trim().slice(0, 500) || null

  if (!from_member_id || !to_member_id) return { error: 'Pick both members.' }
  if (from_member_id === to_member_id) return { error: "Can't settle with yourself." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settled_on)) return { error: 'Invalid date.' }
  if (!amount || amount <= 0) return { error: 'Amount must be positive.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { error } = await supabase.from('settlements').insert({
    household_id: ctx.householdId,
    from_member_id,
    to_member_id,
    amount_cents: amount,
    settled_on,
    note,
  })
  if (error) return { error: error.message }

  revalidatePath('/settlements')
  revalidatePath('/shared')
  return { ok: true }
}

export async function deleteSettlement(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase.from('settlements').delete().eq('id', id).eq('household_id', ctx.householdId)
  revalidatePath('/settlements')
  revalidatePath('/shared')
}
