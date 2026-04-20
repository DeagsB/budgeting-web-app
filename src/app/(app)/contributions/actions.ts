'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'

type RegisteredType = 'tfsa' | 'rrsp' | 'fhsa'
const REGISTERED = new Set<RegisteredType>(['tfsa', 'rrsp', 'fhsa'])

export async function saveContributionRooms(fd: FormData): Promise<void> {
  const year = Number(fd.get('year'))
  if (!Number.isFinite(year) || year < 2000 || year > 2100) return

  const ctx = await getHouseholdContext()
  if (!ctx) return

  const rows: {
    household_id: string
    member_id: string
    account_type: RegisteredType
    year: number
    opening_room_cents: number
    annual_allowance_override_cents: number | null
  }[] = []

  // Keys of the shape `opening:<member_id>:<type>` and `allowance:<member_id>:<type>`
  const seen = new Set<string>()
  for (const key of fd.keys()) {
    const m = key.match(/^(opening|allowance):([0-9a-f-]+):(tfsa|rrsp|fhsa)$/)
    if (!m) continue
    seen.add(`${m[2]}:${m[3]}`)
  }

  for (const key of seen) {
    const [member_id, type] = key.split(':')
    if (!REGISTERED.has(type as RegisteredType)) continue
    const openingStr = String(fd.get(`opening:${member_id}:${type}`) ?? '0')
    const allowStr = String(fd.get(`allowance:${member_id}:${type}`) ?? '')
    const opening = parseMoneyToCents(openingStr) ?? 0
    const allowance = allowStr.trim() === '' ? null : parseMoneyToCents(allowStr)
    rows.push({
      household_id: ctx.householdId,
      member_id,
      account_type: type as RegisteredType,
      year,
      opening_room_cents: opening,
      annual_allowance_override_cents: allowance,
    })
  }

  if (rows.length === 0) return
  const supabase = await createClient()
  await supabase
    .from('member_contribution_rooms')
    .upsert(rows, { onConflict: 'member_id,account_type,year' })

  revalidatePath('/contributions')
}
