'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'

export type SaveBudgetsResult = { ok: true } | { ok: false; error: string }

/**
 * Save the budget form.
 *
 * Each category posts `budget:<id>` (the amount) and optionally
 * `scope:<id>` = `month`. Standing is the default: the amount is written to
 * `category_budgets` and applies to every month, and any override for the
 * posted month is dropped so the row goes back to following it. `month` scope
 * writes the amount to `monthly_budgets` for that month only - including a
 * zero, which is a real "nothing budgeted this month".
 */
export async function saveBudgets(fd: FormData): Promise<SaveBudgetsResult> {
  const month = String(fd.get('month') ?? '')
  if (!/^\d{4}-\d{2}-01$/.test(month)) {
    return { ok: false, error: 'Invalid month.' }
  }

  const ctx = await getHouseholdContext()
  if (!ctx) {
    return { ok: false, error: 'Your session expired. Please sign in again.' }
  }

  const standing: { category_id: string; amount_cents: number }[] = []
  const overrides: { category_id: string; amount_cents: number }[] = []

  for (const [key, value] of fd.entries()) {
    if (!key.startsWith('budget:')) continue
    const category_id = key.slice('budget:'.length)
    const amount_cents = parseMoneyToCents(String(value))
    if (amount_cents === null || amount_cents < 0) continue
    const scope = String(fd.get(`scope:${category_id}`) ?? 'standing')
    ;(scope === 'month' ? overrides : standing).push({ category_id, amount_cents })
  }

  if (standing.length === 0 && overrides.length === 0) return { ok: true }

  const supabase = await createClient()
  const failed = 'Could not save your budgets. Please try again.'

  // A standing row of zero is "not budgeted" - drop it rather than storing a 0.
  const clearStanding = standing.filter((r) => r.amount_cents === 0).map((r) => r.category_id)
  if (clearStanding.length > 0) {
    const { error } = await supabase
      .from('category_budgets')
      .delete()
      .eq('household_id', ctx.householdId)
      .in('category_id', clearStanding)
    if (error) return { ok: false, error: failed }
  }

  const setStanding = standing.filter((r) => r.amount_cents > 0)
  if (setStanding.length > 0) {
    const { error } = await supabase.from('category_budgets').upsert(
      setStanding.map((r) => ({ household_id: ctx.householdId, ...r })),
      { onConflict: 'household_id,category_id' },
    )
    if (error) return { ok: false, error: failed }
  }

  // Anything saved as standing must not keep an override for this month.
  if (standing.length > 0) {
    const { error } = await supabase
      .from('monthly_budgets')
      .delete()
      .eq('household_id', ctx.householdId)
      .eq('month', month)
      .in(
        'category_id',
        standing.map((r) => r.category_id),
      )
    if (error) return { ok: false, error: failed }
  }

  if (overrides.length > 0) {
    const { error } = await supabase.from('monthly_budgets').upsert(
      overrides.map((r) => ({ household_id: ctx.householdId, month, ...r })),
      { onConflict: 'household_id,category_id,month' },
    )
    if (error) return { ok: false, error: failed }
  }

  revalidatePath('/budgets')
  revalidatePath('/dashboard')
  return { ok: true }
}
