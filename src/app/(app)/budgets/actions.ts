'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'

export type SaveBudgetsResult = { ok: true } | { ok: false; error: string }

export async function saveBudgets(fd: FormData): Promise<SaveBudgetsResult> {
  const month = String(fd.get('month') ?? '')
  if (!/^\d{4}-\d{2}-01$/.test(month)) {
    return { ok: false, error: 'Invalid month.' }
  }

  const ctx = await getHouseholdContext()
  if (!ctx) {
    return { ok: false, error: 'Your session expired. Please sign in again.' }
  }

  const rows: { household_id: string; category_id: string; month: string; amount_cents: number }[] =
    []

  for (const [key, value] of fd.entries()) {
    if (!key.startsWith('budget:')) continue
    const category_id = key.slice('budget:'.length)
    const amount = parseMoneyToCents(String(value))
    if (amount === null || amount < 0) continue
    rows.push({ household_id: ctx.householdId, category_id, month, amount_cents: amount })
  }

  // Nothing parseable to write - treat as a no-op success so the UI doesn't
  // flash an error when a user saves an unchanged form.
  if (rows.length === 0) return { ok: true }

  const supabase = await createClient()

  const zero = rows.filter((r) => r.amount_cents === 0).map((r) => r.category_id)
  if (zero.length > 0) {
    const { error } = await supabase
      .from('monthly_budgets')
      .delete()
      .eq('household_id', ctx.householdId)
      .eq('month', month)
      .in('category_id', zero)
    if (error) return { ok: false, error: 'Could not save your budgets. Please try again.' }
  }

  const nonZero = rows.filter((r) => r.amount_cents > 0)
  if (nonZero.length > 0) {
    const { error } = await supabase
      .from('monthly_budgets')
      .upsert(nonZero, { onConflict: 'household_id,category_id,month' })
    if (error) return { ok: false, error: 'Could not save your budgets. Please try again.' }
  }

  revalidatePath('/budgets')
  revalidatePath('/dashboard')
  return { ok: true }
}
