'use server'

import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import {
  CODE_RE,
  createCategoryCore,
  revalidateCategoryConsumers,
  type CreateCategoryInput,
  type CreateCategoryResult,
} from '@/lib/categories'

export type CategoryState = { error: string } | undefined

/** `useActionState` adapter for the /categories page add form. */
export async function createCategory(
  _prev: CategoryState,
  fd: FormData,
): Promise<CategoryState> {
  const res = await createCategoryCore({
    name: String(fd.get('name') ?? ''),
    parentId: String(fd.get('parent_id') ?? '').trim() || null,
    code: String(fd.get('code') ?? '').trim() || null,
  })
  return res.ok ? undefined : { error: res.error }
}

/**
 * Direct adapter that RETURNS the new id, so callers (e.g. the inline
 * create-and-apply flow in the transaction categorizer) can immediately assign
 * the freshly-created category.
 */
export async function createCategoryReturning(
  input: CreateCategoryInput,
): Promise<CreateCategoryResult> {
  return createCategoryCore(input)
}

export async function updateCategory(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  const name = String(fd.get('name') ?? '').trim().slice(0, 80)
  const code = String(fd.get('code') ?? '').trim().toUpperCase()
  const rollover_enabled = fd.get('rollover_enabled') === 'on'
  if (!id || !name || !CODE_RE.test(code)) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()
  await supabase
    .from('categories')
    .update({ name, code, rollover_enabled })
    .eq('id', id)
    .eq('household_id', ctx.householdId)

  revalidateCategoryConsumers()
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

  revalidateCategoryConsumers()
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

  revalidateCategoryConsumers()
}
