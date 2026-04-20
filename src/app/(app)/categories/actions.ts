'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'

export type CategoryState = { error: string } | undefined

const CODE_RE = /^[A-Z][A-Z0-9_.]{0,39}$/

function slugCode(name: string, parentCode?: string | null): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  if (!base) return 'CAT'
  return parentCode ? `${parentCode}.${base}` : base
}

export async function createCategory(
  _prev: CategoryState,
  fd: FormData,
): Promise<CategoryState> {
  const name = String(fd.get('name') ?? '').trim().slice(0, 80)
  let code = String(fd.get('code') ?? '').trim().toUpperCase()
  const parent_id = String(fd.get('parent_id') ?? '').trim() || null

  if (!name) return { error: 'Name is required.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()

  // Two-level max: reject if parent is itself a child
  if (parent_id) {
    const { data: parent } = await supabase
      .from('categories')
      .select('code, parent_id')
      .eq('id', parent_id)
      .eq('household_id', ctx.householdId)
      .single()
    if (!parent) return { error: 'Parent category not found.' }
    if (parent.parent_id) return { error: 'Nesting deeper than two levels is not supported.' }
    if (!code) code = slugCode(name, parent.code)
  } else if (!code) {
    code = slugCode(name)
  }

  if (!CODE_RE.test(code)) {
    return { error: 'Code must start with A-Z and use only A-Z, 0-9, _, or .' }
  }

  const { data: maxOrder } = await supabase
    .from('categories')
    .select('sort_order')
    .eq('household_id', ctx.householdId)
    .eq('parent_id', parent_id as string)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextOrder = (maxOrder?.sort_order ?? -1) + 1

  const { error } = await supabase.from('categories').insert({
    household_id: ctx.householdId,
    parent_id,
    name,
    code,
    sort_order: nextOrder,
  })
  if (error) return { error: error.message }

  revalidatePath('/categories')
  return undefined
}

export async function updateCategory(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  const name = String(fd.get('name') ?? '').trim().slice(0, 80)
  const code = String(fd.get('code') ?? '').trim().toUpperCase()
  if (!id || !name || !CODE_RE.test(code)) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('categories')
    .update({ name, code })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/categories')
}

export async function archiveCategory(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/categories')
}

export async function unarchiveCategory(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('categories')
    .update({ archived_at: null })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidatePath('/categories')
}
