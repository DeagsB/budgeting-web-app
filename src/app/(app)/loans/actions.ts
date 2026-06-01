'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'

export type LoanState = { error: string } | { ok: true } | undefined
export type RateChangeState = { error: string } | { ok: true } | undefined

export async function saveLoanDetails(_prev: LoanState, fd: FormData): Promise<LoanState> {
  const account_id = String(fd.get('account_id') ?? '')
  const ratePct = Number(fd.get('annual_rate_pct'))
  const origination_date = String(fd.get('origination_date') ?? '')
  const originalPrincipal = parseMoneyToCents(String(fd.get('original_principal') ?? ''))
  const monthlyPayment = parseMoneyToCents(String(fd.get('monthly_payment') ?? ''))

  if (!account_id) return { error: 'Pick a loan account.' }
  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    return { error: 'Rate must be between 0% and 100%.' }
  }
  if (!origination_date) return { error: 'Origination date is required.' }
  if (!originalPrincipal || originalPrincipal <= 0) {
    return { error: 'Original principal must be positive.' }
  }
  if (!monthlyPayment || monthlyPayment <= 0) {
    return { error: 'Monthly payment must be positive.' }
  }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { error } = await supabase.from('loan_details').upsert(
    {
      account_id,
      household_id: ctx.householdId,
      annual_rate_bps: Math.round(ratePct * 100),
      origination_date,
      original_principal_cents: originalPrincipal,
      contractual_monthly_payment_cents: monthlyPayment,
    },
    { onConflict: 'account_id' },
  )

  if (error) return { error: error.message }

  revalidatePath('/loans')
  revalidatePath('/dashboard')
  return { ok: true }
}

export async function addRateChange(
  _prev: RateChangeState,
  fd: FormData,
): Promise<RateChangeState> {
  const account_id = String(fd.get('account_id') ?? '')
  const effective_month = String(fd.get('effective_month') ?? '')
  const ratePct = Number(fd.get('annual_rate_pct'))
  const note = String(fd.get('note') ?? '').trim().slice(0, 500) || null

  if (!account_id) return { error: 'Missing loan.' }
  if (!/^\d{4}-\d{2}-01$/.test(effective_month)) {
    return { error: 'Effective month must be the first of a month (YYYY-MM-01).' }
  }
  if (!Number.isFinite(ratePct) || ratePct < 0 || ratePct > 100) {
    return { error: 'Rate must be between 0 and 100%.' }
  }

  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const supabase = await createClient()
  const { error } = await supabase.from('loan_rate_changes').upsert(
    {
      household_id: ctx.householdId,
      account_id,
      effective_month,
      annual_rate_bps: Math.round(ratePct * 100),
      note,
    },
    { onConflict: 'account_id,effective_month' },
  )
  if (error) return { error: error.message }

  revalidatePath('/loans')
  return { ok: true }
}

export async function deleteRateChange(fd: FormData): Promise<void> {
  const id = String(fd.get('id') ?? '')
  if (!id) return
  const ctx = await getHouseholdContext()
  if (!ctx) return
  const supabase = await createClient()
  await supabase.from('loan_rate_changes').delete().eq('id', id).eq('household_id', ctx.householdId)
  revalidatePath('/loans')
}
