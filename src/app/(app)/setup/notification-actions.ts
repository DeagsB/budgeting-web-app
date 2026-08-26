'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { DEFAULT_PREFS, type NotificationPrefs, type SavePrefsState } from './notification-prefs'

export async function saveNotificationPrefs(
  _prev: SavePrefsState,
  fd: FormData,
): Promise<SavePrefsState> {
  const ctx = await getHouseholdContext()
  if (!ctx) return { error: 'Not authorized.' }

  const thresholdDollars = Number(fd.get('large_threshold') ?? '200')
  const prefs: NotificationPrefs = {
    new_transaction: fd.get('new_transaction') === 'on',
    large_transaction: fd.get('large_transaction') === 'on',
    large_threshold_cents:
      Number.isFinite(thresholdDollars) && thresholdDollars > 0
        ? Math.round(thresholdDollars * 100)
        : DEFAULT_PREFS.large_threshold_cents,
    budget_overspend: fd.get('budget_overspend') === 'on',
    unmatched_alert: fd.get('unmatched_alert') === 'on',
    settlement_period: fd.get('settlement_period') === 'on',
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('households')
    .update({ notification_prefs: prefs })
    .eq('id', ctx.householdId)
  if (error) return { error: error.message }

  revalidatePath('/setup')
  return { ok: true }
}
