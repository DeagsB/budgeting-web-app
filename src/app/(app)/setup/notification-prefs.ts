// Plain module (not 'use server') so non-async values + types can be exported
// and shared by the server action, the client component, and the page.

export type NotificationPrefs = {
  new_transaction: boolean
  large_transaction: boolean
  large_threshold_cents: number
  budget_overspend: boolean
  unmatched_alert: boolean
  settlement_period: boolean
}

export const DEFAULT_PREFS: NotificationPrefs = {
  new_transaction: true,
  large_transaction: false,
  large_threshold_cents: 20000,
  budget_overspend: true,
  unmatched_alert: false,
  settlement_period: true,
}

export type SavePrefsState = { ok: true } | { error: string } | undefined
