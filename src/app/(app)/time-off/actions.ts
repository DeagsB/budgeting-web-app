'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'

function parseHours(str: string): number {
  const cleaned = str.replace(/[^0-9.]/g, '')
  if (!cleaned) return 0
  const n = Number(cleaned)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0
}

export async function saveTimeOff(fd: FormData): Promise<void> {
  const month = String(fd.get('period_month') ?? '')
  if (!/^\d{4}-\d{2}-01$/.test(month)) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

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

  if (upserts.length === 0) return
  const supabase = await createClient()
  await supabase
    .from('time_off_entries')
    .upsert(upserts, { onConflict: 'member_id,period_month' })

  revalidatePath('/time-off')
}
