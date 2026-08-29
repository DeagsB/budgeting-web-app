'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'
import { isManuallyEditableBalance } from '@/lib/balances'

export async function saveBalances(fd: FormData): Promise<void> {
  const month = String(fd.get('month') ?? '')
  if (!/^\d{4}-\d{2}-01$/.test(month)) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const supabase = await createClient()

  const submittedIds = [...fd.keys()]
    .filter((k) => k.startsWith('bal:'))
    .map((k) => k.slice('bal:'.length))
  if (submittedIds.length === 0) return

  // A linked account's balance always comes from the bank via Plaid sync
  // (src/lib/plaid-balances.ts) - refuse a typed value for one even if a
  // request is crafted outside the read-only form, so the bank's own figure
  // can never be shadowed by a stale hand-typed guess.
  const { data: accountRows } = await supabase
    .from('accounts')
    .select('id, plaid_account_id')
    .eq('household_id', ctx.householdId)
    .in('id', submittedIds)
  const manuallyEditable = new Set(
    (accountRows ?? [])
      .filter((r) => isManuallyEditableBalance({ plaid_account_id: r.plaid_account_id as string | null }))
      .map((r) => r.id as string),
  )

  const upserts: {
    household_id: string
    account_id: string
    as_of_month: string
    balance_cents: number
  }[] = []
  const clears: string[] = []

  for (const [key, value] of fd.entries()) {
    if (!key.startsWith('bal:')) continue
    const account_id = key.slice('bal:'.length)
    if (!manuallyEditable.has(account_id)) continue
    const str = String(value).trim()
    if (str === '') {
      clears.push(account_id)
      continue
    }
    const cents = parseMoneyToCents(str)
    if (cents === null) continue
    upserts.push({ household_id: ctx.householdId, account_id, as_of_month: month, balance_cents: cents })
  }

  if (clears.length > 0) {
    await supabase
      .from('account_balance_snapshots')
      .delete()
      .eq('household_id', ctx.householdId)
      .eq('as_of_month', month)
      .in('account_id', clears)
  }
  if (upserts.length > 0) {
    await supabase
      .from('account_balance_snapshots')
      .upsert(upserts, { onConflict: 'account_id,as_of_month' })
  }

  revalidatePath('/balance-sheet')
  revalidatePath('/dashboard')
}
