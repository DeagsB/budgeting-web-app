'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'

async function hh() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()
  return { ctx, supabase }
}

// ───────── household ─────────

export async function renameHousehold(fd: FormData) {
  const h = await hh()
  if (!h) return
  const id = String(fd.get('id') ?? '')
  const name = String(fd.get('name') ?? '').trim()
  if (!id || !name) return
  await h.supabase.from('households').update({ name }).eq('id', id)
  revalidatePath('/setup')
  revalidatePath('/', 'layout')
}

// ───────── members ─────────

export async function addMember(fd: FormData) {
  const h = await hh()
  if (!h) return
  const name = String(fd.get('name') ?? '').trim()
  if (!name) return
  await h.supabase
    .from('members')
    .insert({ household_id: h.ctx.householdId, display_name: name })
  revalidatePath('/setup')
}

export async function renameMember(fd: FormData) {
  const h = await hh()
  if (!h) return
  const id = String(fd.get('id') ?? '')
  const name = String(fd.get('name') ?? '').trim()
  if (!id || !name) return
  await h.supabase
    .from('members')
    .update({ display_name: name })
    .eq('id', id)
    .eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
}

export async function archiveMember(fd: FormData) {
  const h = await hh()
  if (!h) return
  const id = String(fd.get('id') ?? '')
  if (!id) return
  await h.supabase
    .from('members')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
}

export async function unarchiveMember(fd: FormData) {
  const h = await hh()
  if (!h) return
  const id = String(fd.get('id') ?? '')
  if (!id) return
  await h.supabase
    .from('members')
    .update({ archived_at: null })
    .eq('id', id)
    .eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
}

// ───────── categories ─────────

export async function addCategory(fd: FormData) {
  const h = await hh()
  if (!h) return
  const name = String(fd.get('name') ?? '').trim()
  const parentRaw = String(fd.get('parent_id') ?? '').trim()
  const parent_id = parentRaw || null
  if (!name) return
  const code = codeFromName(name, parent_id)
  await h.supabase
    .from('categories')
    .insert({ household_id: h.ctx.householdId, name, parent_id, code })
  revalidatePath('/setup')
  revalidatePath('/budgets')
  revalidatePath('/transactions')
}

export async function renameCategory(fd: FormData) {
  const h = await hh()
  if (!h) return
  const id = String(fd.get('id') ?? '')
  const name = String(fd.get('name') ?? '').trim()
  if (!id || !name) return
  await h.supabase
    .from('categories')
    .update({ name })
    .eq('id', id)
    .eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
  revalidatePath('/budgets')
  revalidatePath('/transactions')
}

export async function toggleRollover(fd: FormData) {
  const h = await hh()
  if (!h) return
  const id = String(fd.get('id') ?? '')
  if (!id) return
  const rollover_enabled = String(fd.get('rollover')) === 'true'
  await h.supabase
    .from('categories')
    .update({ rollover_enabled })
    .eq('id', id)
    .eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
  revalidatePath('/budgets')
}

export async function archiveCategory(fd: FormData) {
  const h = await hh()
  if (!h) return
  const id = String(fd.get('id') ?? '')
  if (!id) return
  await h.supabase
    .from('categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
  revalidatePath('/budgets')
  revalidatePath('/transactions')
}

export async function unarchiveCategory(fd: FormData) {
  const h = await hh()
  if (!h) return
  const id = String(fd.get('id') ?? '')
  if (!id) return
  await h.supabase
    .from('categories')
    .update({ archived_at: null })
    .eq('id', id)
    .eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
  revalidatePath('/budgets')
  revalidatePath('/transactions')
}

// ───────── helpers ─────────

/**
 * categories.code has a strict regex constraint (^[A-Z][A-Z0-9_.]{0,39}$).
 * Generate a compliant code from a category name, uniquified by a short
 * random suffix so duplicates don't collide on the unique(household, code).
 */
function codeFromName(name: string, parentId: string | null): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  const safe = base && /^[A-Z]/.test(base) ? base : `C_${base || 'CAT'}`
  const tail = Math.random().toString(36).slice(2, 6).toUpperCase()
  const dot = parentId ? '.' : '.'
  return `${safe.slice(0, 32)}${dot}${tail}`.slice(0, 40)
}
