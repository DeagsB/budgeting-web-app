'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { parseMoneyToCents } from '@/lib/format'
import { DEFAULT_PREFS, type NotificationPrefs, type SavePrefsState } from './notification-prefs'
import { humanizeDbError } from '@/lib/errors'

export async function saveNotificationPrefs(
  _prev: SavePrefsState,
  fd: FormData,
): Promise<SavePrefsState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const thresholdRaw = String(fd.get('large_threshold') ?? '').trim()
  const thresholdCents = thresholdRaw === '' ? DEFAULT_PREFS.large_threshold_cents : parseMoneyToCents(thresholdRaw)
  if (thresholdCents === null || thresholdCents <= 0) {
    return { error: 'Large-transaction threshold must be a dollar amount above zero, e.g. 200.' }
  }

  const prefs: NotificationPrefs = {
    new_transaction: fd.get('new_transaction') === 'on',
    large_transaction: fd.get('large_transaction') === 'on',
    large_threshold_cents: thresholdCents,
    budget_overspend: fd.get('budget_overspend') === 'on',
    unmatched_alert: fd.get('unmatched_alert') === 'on',
    settlement_period: fd.get('settlement_period') === 'on',
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('households')
    .update({ notification_prefs: prefs })
    .eq('id', ctx.householdId)
  if (error) return { error: humanizeDbError(error) }

  revalidatePath('/setup')
  return { ok: true }
}
