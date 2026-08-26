'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseDecimal } from '@/lib/format'
import { humanizeDbError } from '@/lib/errors'

/** Hours are a non-negative decimal; blank or unparseable input counts as 0. */
function parseHours(str: string): number {
  const n = parseDecimal(str) ?? 0
  return Math.max(0, n)
}

export type SaveTimeOffResult = { ok: true } | { ok: false; error: string }

export async function saveTimeOff(fd: FormData): Promise<SaveTimeOffResult> {
  const month = String(fd.get('period_month') ?? '')
  if (!/^\d{4}-\d{2}-01$/.test(month)) {
    return { ok: false, error: 'Invalid month.' }
  }

  const ctx = await getHouseholdContext()
  if (!ctx) return { ok: false, error: 'Not authorized.' }

  const upserts: {
    household_id: string
    member_id: string
    period_month: string
    vacation_accrued_hours: number
    vacation_used_hours: number
    flex_accrued_hours: number
    flex_used_hours: number
  }[] = []

  const memberIds = new Set<string>()
  for (const key of fd.keys()) {
    const m = key.match(/^(vac_acc|vac_use|flex_acc|flex_use):([0-9a-f-]+)$/)
    if (m) memberIds.add(m[2])
  }

  for (const member_id of memberIds) {
    upserts.push({
      household_id: ctx.householdId,
      member_id,
      period_month: month,
      vacation_accrued_hours: parseHours(String(fd.get(`vac_acc:${member_id}`) ?? '')),
      vacation_used_hours: parseHours(String(fd.get(`vac_use:${member_id}`) ?? '')),
      flex_accrued_hours: parseHours(String(fd.get(`flex_acc:${member_id}`) ?? '')),
      flex_used_hours: parseHours(String(fd.get(`flex_use:${member_id}`) ?? '')),
    })
  }

  if (upserts.length === 0) {
    return { ok: false, error: 'Nothing changed.' }
  }
  const supabase = await createClient()
  const { error } = await supabase
    .from('time_off_entries')
    .upsert(upserts, { onConflict: 'member_id,period_month' })

  if (error) return { ok: false, error: humanizeDbError(error) }

  revalidatePath('/time-off')
  return { ok: true }
}
