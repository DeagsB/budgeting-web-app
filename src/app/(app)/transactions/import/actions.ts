'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'

export type ImportState = { error: string } | { ok: true; count: number } | undefined

export type StagedTx = {
  occurred_on: string // YYYY-MM-DD
  amount_cents: number
  description: string | null
  account_id: string
  category_id: string | null
  member_id: string | null
}

export async function commitImport(
  _prev: ImportState,
  fd: FormData,
): Promise<ImportState> {
  const payload = String(fd.get('rows') ?? '')
  if (!payload) return { error: 'No rows to import.' }

  let rows: StagedTx[]
  try {
    rows = JSON.parse(payload)
  } catch {
    return { error: 'Failed to parse rows.' }
  }
  if (!Array.isArray(rows) || rows.length === 0) return { error: 'No rows to import.' }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()

  const inserted: { id: string; amount_cents: number; category_id: string | null }[] = []
  for (const r of rows) {
    if (!r.occurred_on || !/^\d{4}-\d{2}-\d{2}$/.test(r.occurred_on)) continue
    if (!r.account_id) continue
    if (typeof r.amount_cents !== 'number' || !Number.isFinite(r.amount_cents)) continue

    const { data, error } = await supabase
      .from('transactions')
      .insert({
        household_id: ctx.householdId,
        occurred_on: r.occurred_on,
        account_id: r.account_id,
        member_id: r.member_id,
        description: r.description,
        amount_cents: r.amount_cents,
      })
      .select('id')
      .single()

    if (error || !data) continue
    inserted.push({ id: data.id, amount_cents: r.amount_cents, category_id: r.category_id })
  }

  if (inserted.length > 0) {
    await supabase.from('transaction_splits').insert(
      inserted.map((row) => ({
        household_id: ctx.householdId,
        transaction_id: row.id,
        category_id: row.category_id,
        amount_cents: row.amount_cents,
        sort_order: 0,
      })),
    )
  }

  revalidatePath('/transactions')
  revalidatePath('/dashboard')
  revalidatePath('/budgets')
  revalidatePath('/pnl')
  return { ok: true, count: inserted.length }
}
