'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'

export type MemberState = { error: string } | undefined

function clean(v: FormDataEntryValue | null, max = 80): string {
  return String(v ?? '').trim().slice(0, max)
}

export async function addMember(_prev: MemberState, formData: FormData): Promise<MemberState> {
  const name = clean(formData.get('display_name'))
  if (!name) return { error: 'Name is required.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { data: existing } = await supabase
    .from('members')
    .select('sort_order')
    .eq('household_id', ctx.householdId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (existing?.sort_order ?? -1) + 1

  const { error } = await supabase
    .from('members')
    .insert({ household_id: ctx.householdId, display_name: name, sort_order: nextOrder })
  if (error) return { error: error.message }

  revalidatePath('/members')
  revalidatePath('/dashboard')
  return undefined
}

export async function renameMember(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  const name = clean(formData.get('display_name'))
  if (!id || !name) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('members')
    .update({ display_name: name })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/members')
  revalidatePath('/dashboard')
}

export async function deleteMember(formData: FormData): Promise<void> {
  const id = String(formData.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase.from('members').delete().eq('id', id).eq('household_id', ctx.householdId)

  revalidatePath('/members')
  revalidatePath('/dashboard')
}
