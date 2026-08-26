'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { revalidateCategoryConsumers } from '@/lib/categories'

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
  // A linked member is someone's identity; remove their login first.
  await h.supabase
    .from('members')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('household_id', h.ctx.householdId)
    .is('user_id', null)
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
//
// Creation lives in the shared engine (src/lib/categories.ts) so the /setup
// card and the /categories page can't diverge. The mutations below all bust
// every category-consuming route via revalidateCategoryConsumers().

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
  revalidateCategoryConsumers()
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
  revalidateCategoryConsumers()
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
  revalidateCategoryConsumers()
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
  revalidateCategoryConsumers()
}

// ───────── household split ratio ─────────

export async function saveSplitWeights(fd: FormData): Promise<{ ok: true } | { error: string }> {
  const h = await hh()
  if (!h) return { error: 'Not authorized.' }
  const { data: members } = await h.supabase
    .from('members')
    .select('id')
    .eq('household_id', h.ctx.householdId)
    .is('archived_at', null)
  const updates: { id: string; weight: number }[] = []
  for (const m of members ?? []) {
    const raw = fd.get(`weight:${m.id}`)
    if (raw === null) continue
    const w = Math.floor(Number(String(raw)))
    if (!Number.isFinite(w) || w < 0) return { error: 'Weights must be whole numbers, zero or more.' }
    updates.push({ id: m.id as string, weight: w })
  }
  if (updates.length > 0 && updates.every((u) => u.weight === 0)) return { error: 'At least one member needs a weight above zero.' }
  for (const u of updates) {
    const { error } = await h.supabase.from('members').update({ split_weight: u.weight }).eq('id', u.id).eq('household_id', h.ctx.householdId)
    if (error) return { error: error.message }
  }
  revalidatePath('/setup')
  revalidatePath('/shared')
  revalidatePath('/rules')
  return { ok: true }
}
