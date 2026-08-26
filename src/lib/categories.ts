import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { humanizeDbError } from '@/lib/errors'

/**
 * Single source of truth for creating spending categories.
 *
 * Historically two divergent server actions inserted categories — the /setup
 * card and the /categories page — and they drifted: one set `sort_order`, the
 * other didn't; they revalidated different page sets; only one enforced the
 * two-level nesting rule. That divergence is why freshly-added categories
 * "didn't populate correctly" (wrong order, or missing on the page where you
 * apply them). Both UIs now route through `createCategoryCore`.
 */

// Mirrors the DB CHECK constraint on categories.code.
export const CODE_RE = /^[A-Z][A-Z0-9_.]{0,39}$/

// Every route whose server render reads the categories table. A category
// mutation must bust the client Router Cache for all of them — `force-dynamic`
// on the (app) layout only re-renders on a fresh request, so a soft navigation
// to an already-visited route still serves a stale RSC payload until the path
// is revalidated.
const CONSUMER_PATHS = [
  '/categories',
  '/setup',
  '/budgets',
  '/transactions',
  '/dashboard',
  '/pnl',
] as const

export function revalidateCategoryConsumers() {
  for (const p of CONSUMER_PATHS) revalidatePath(p)
}

/** Derive a constraint-valid code from a name (child codes prefix the parent). */
export function slugCode(name: string, parentCode?: string | null): string {
  const base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20)
  if (!base) return 'CAT'
  return parentCode ? `${parentCode}.${base}` : base
}

export type CreateCategoryInput = {
  name: string
  parentId?: string | null
  /** Optional manual override — only the /categories page exposes this field. */
  code?: string | null
}

export type CreateCategoryResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

type SupabaseServer = Awaited<ReturnType<typeof createClient>>

/**
 * Return `base` if it's free within the household, otherwise the first
 * `base_2`, `base_3`, … variant that fits the 40-char column cap. Closes the
 * duplicate-name collision that previously surfaced as a raw Postgres
 * unique-violation string in the UI.
 */
async function uniqueCode(
  supabase: SupabaseServer,
  householdId: string,
  base: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('categories')
    .select('code')
    .eq('household_id', householdId)
  const taken = new Set((data ?? []).map((r) => r.code as string))
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const suffix = `_${n}`
    const candidate = base.slice(0, 40 - suffix.length) + suffix
    if (!taken.has(candidate)) return candidate
  }
  return null
}

export async function createCategoryCore(
  input: CreateCategoryInput,
): Promise<CreateCategoryResult> {
  const name = input.name.trim().slice(0, 80)
  if (!name) return { ok: false, error: 'Name is required.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { ok: false, error: 'Not authorized.' }

  const supabase = await createClient()
  const parent_id = input.parentId?.trim() || null

  // Two-level maximum: a parent must exist in this household and be top-level.
  let parentCode: string | null = null
  if (parent_id) {
    const { data: parent } = await supabase
      .from('categories')
      .select('code, parent_id')
      .eq('id', parent_id)
      .eq('household_id', ctx.householdId)
      .single()
    if (!parent) return { ok: false, error: 'Parent category not found.' }
    if (parent.parent_id) {
      return { ok: false, error: 'Nesting deeper than two levels is not supported.' }
    }
    parentCode = parent.code as string
  }

  // Derive + validate the code, then make it household-unique.
  let code = (input.code ?? '').trim().toUpperCase()
  if (!code) code = slugCode(name, parentCode)
  if (!CODE_RE.test(code)) {
    return { ok: false, error: 'Code must start with A–Z and use only A–Z, 0–9, _, or .' }
  }
  const finalCode = await uniqueCode(supabase, ctx.householdId, code)
  if (!finalCode) return { ok: false, error: 'Could not generate a unique code for that name.' }

  // Next sort_order within the parent group. NOTE: top-level rows need
  // `.is('parent_id', null)` — `.eq('parent_id', null)` matches nothing in
  // PostgREST, which is the latent bug that left new top-level categories at
  // sort_order 0 and jumbled their order everywhere.
  const orderBase = supabase
    .from('categories')
    .select('sort_order')
    .eq('household_id', ctx.householdId)
  const { data: maxOrder } = await (parent_id
    ? orderBase.eq('parent_id', parent_id)
    : orderBase.is('parent_id', null)
  )
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const sort_order = (maxOrder?.sort_order ?? -1) + 1

  const { data: inserted, error } = await supabase
    .from('categories')
    .insert({ household_id: ctx.householdId, parent_id, name, code: finalCode, sort_order })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'A category with that code already exists.' }
    }
    return { ok: false, error: humanizeDbError(error, { entity: 'category code' }) }
  }
  if (!inserted?.id) {
    return { ok: false, error: 'Category was created but could not be loaded.' }
  }

  revalidateCategoryConsumers()
  return { ok: true, id: inserted.id as string }
}
