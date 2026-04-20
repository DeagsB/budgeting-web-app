'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'

export type GoalState = { error: string } | undefined

type GoalInput = {
  name: string
  target_amount_cents: number
  current_amount_cents: number
  target_date: string | null
  funding_account_id: string | null
  note: string | null
}

type ParseResult = { error: string; ok?: never } | { ok: GoalInput; error?: never }

function parseForm(fd: FormData): ParseResult {
  const name = String(fd.get('name') ?? '').trim().slice(0, 120)
  const target = parseMoneyToCents(String(fd.get('target_amount') ?? ''))
  const current = parseMoneyToCents(String(fd.get('current_amount') ?? '0')) ?? 0
  const target_date = String(fd.get('target_date') ?? '').trim() || null
  const funding_account_id = String(fd.get('funding_account_id') ?? '').trim() || null
  const note = String(fd.get('note') ?? '').trim().slice(0, 1000) || null

  if (!name) return { error: 'Name is required.' }
  if (target === null || target <= 0) return { error: 'Target amount must be positive.' }
  if (current < 0) return { error: 'Current amount cannot be negative.' }

  return {
    ok: {
      name,
      target_amount_cents: target,
      current_amount_cents: current,
      target_date,
      funding_account_id,
      note,
    },
  }
}

export async function createGoal(_prev: GoalState, fd: FormData): Promise<GoalState> {
  const parsed = parseForm(fd)
  if (!parsed.ok) return { error: parsed.error }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { error } = await supabase.from('goals').insert({
    household_id: ctx.householdId,
    ...parsed.ok,
  })
  if (error) return { error: error.message }

  revalidatePath('/goals')
  return undefined
}

export async function updateGoal(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return
  const parsed = parseForm(fd)
  if (!parsed.ok) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('goals')
    .update(parsed.ok)
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/goals')
}

export async function toggleAchieved(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  const markAchieved = fd.get('achieved') === '1'
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('goals')
    .update({ achieved_at: markAchieved ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/goals')
}

export async function archiveGoal(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('goals')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/goals')
}
