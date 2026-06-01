// Web Push fan-out. All functions are best-effort and never throw — a push
// failure must never break the webhook that triggered it. Sends use the
// service-role client (bypasses RLS) and prune dead subscriptions.

import webpush from 'web-push'
import { createServiceClient } from '@/lib/supabase/service'
import { formatMoney } from '@/lib/format'

export type PushPayload = { title: string; body: string; url?: string; tag?: string }

export type NotificationPrefs = {
  new_transaction?: boolean
  large_transaction?: boolean
  large_threshold_cents?: number
  budget_overspend?: boolean
  unmatched_alert?: boolean
}

let configured: boolean | null = null
function ensureConfigured(): boolean {
  if (configured !== null) return configured
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:notifications@maple.app'
  if (!pub || !priv) {
    configured = false
    return false
  }
  webpush.setVapidDetails(subject, pub, priv)
  configured = true
  return true
}

/** Send a payload to every subscription in a household; prune 404/410s. */
export async function sendPushToHousehold(householdId: string, payload: PushPayload): Promise<void> {
  if (!ensureConfigured()) return
  const service = createServiceClient()
  if (!service) return

  const { data: subs } = await service
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('household_id', householdId)
  if (!subs || subs.length === 0) return

  const body = JSON.stringify(payload)
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint as string, keys: { p256dh: s.p256dh as string, auth: s.auth as string } },
          body,
        )
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode
        if (code === 404 || code === 410) {
          await service.from('push_subscriptions').delete().eq('id', s.id)
        }
      }
    }),
  )
}

async function getPrefs(householdId: string): Promise<NotificationPrefs> {
  const service = createServiceClient()
  if (!service) return {}
  const { data } = await service
    .from('households')
    .select('notification_prefs')
    .eq('id', householdId)
    .maybeSingle()
  return (data?.notification_prefs as NotificationPrefs) ?? {}
}

/**
 * Notify about a freshly-inserted transaction. Fires when `new_transaction` is
 * on, or when `large_transaction` is on and the amount clears the threshold.
 * amountCents is signed (positive = outflow).
 */
export async function notifyTransactionInserted(
  householdId: string,
  tx: { amountCents: number; accountName: string | null; description: string | null },
): Promise<void> {
  const prefs = await getPrefs(householdId)
  const abs = Math.abs(tx.amountCents)
  const threshold = prefs.large_threshold_cents ?? 20000
  const wantAll = prefs.new_transaction === true
  const wantLarge = prefs.large_transaction === true && abs >= threshold
  if (!wantAll && !wantLarge) return

  const isOutflow = tx.amountCents >= 0
  const signed = `${isOutflow ? '−' : '+'}${formatMoney(abs)}`
  const where = tx.accountName ? ` · ${tx.accountName}` : ''
  await sendPushToHousehold(householdId, {
    title: tx.description?.trim() || (isOutflow ? 'New transaction' : 'Money in'),
    body: `${signed}${where}`,
    url: '/transactions',
    tag: 'maple-transaction',
  })
}

/** Notify that a bank-alert email matched no rule, so the user adds one. */
export async function notifyUnmatchedAlert(
  householdId: string,
  email: { from: string | null; subject: string | null },
): Promise<void> {
  const prefs = await getPrefs(householdId)
  if (prefs.unmatched_alert !== true) return
  await sendPushToHousehold(householdId, {
    title: 'Bank alert not imported',
    body: `No rule matched "${(email.subject || email.from || 'an alert').slice(0, 60)}". Tap to add one.`,
    url: '/transactions/import/auto-setup',
    tag: 'maple-unmatched',
  })
}

/**
 * Notify when an outflow pushes a category over its monthly budget — only on
 * the transaction that crosses the line (so it fires once, not every spend
 * after). categoryId may be a child; we roll up to whichever category carries
 * the monthly budget.
 */
export async function notifyBudgetOverspendIfCrossed(
  householdId: string,
  tx: { amountCents: number; categoryId: string | null; occurredOn: string },
): Promise<void> {
  if (tx.amountCents <= 0 || !tx.categoryId) return // inflows / uncategorised can't overspend
  const prefs = await getPrefs(householdId)
  if (prefs.budget_overspend !== true) return

  const service = createServiceClient()
  if (!service) return

  const month = `${tx.occurredOn.slice(0, 7)}-01`
  const nextMonth = `${Number(tx.occurredOn.slice(0, 4)) + (tx.occurredOn.slice(5, 7) === '12' ? 1 : 0)}-${tx.occurredOn.slice(5, 7) === '12' ? '01' : String(Number(tx.occurredOn.slice(5, 7)) + 1).padStart(2, '0')}-01`

  // Resolve the budgeted category: the transaction's category or its parent,
  // whichever has a monthly_budgets row this month.
  const { data: cat } = await service
    .from('categories')
    .select('id, name, parent_id')
    .eq('id', tx.categoryId)
    .maybeSingle()
  if (!cat) return
  const candidateIds = [cat.id as string, cat.parent_id as string | null].filter(Boolean) as string[]

  const { data: budgets } = await service
    .from('monthly_budgets')
    .select('category_id, amount_cents')
    .eq('household_id', householdId)
    .eq('month', month)
    .in('category_id', candidateIds)
  if (!budgets || budgets.length === 0) return
  const budget = budgets[0]
  const budgetCents = Number(budget.amount_cents)
  const budgetCatId = budget.category_id as string

  // Children of the budgeted category count toward its spend.
  const { data: children } = await service
    .from('categories')
    .select('id')
    .eq('household_id', householdId)
    .eq('parent_id', budgetCatId)
  const spendCatIds = [budgetCatId, ...((children ?? []).map((c) => c.id as string))]

  const { data: splits } = await service
    .from('transaction_splits')
    .select('amount_cents, transaction:transactions!inner(occurred_on)')
    .eq('household_id', householdId)
    .in('category_id', spendCatIds)
    .gte('transaction.occurred_on', month)
    .lt('transaction.occurred_on', nextMonth)
  const spend = (splits ?? []).reduce((s, r) => s + Math.max(0, Number(r.amount_cents)), 0)
  const prevSpend = spend - tx.amountCents

  // Only when THIS transaction crossed the line.
  if (prevSpend < budgetCents && spend >= budgetCents) {
    const over = spend - budgetCents
    const { data: catName } = await service
      .from('categories')
      .select('name')
      .eq('id', budgetCatId)
      .maybeSingle()
    await sendPushToHousehold(householdId, {
      title: `${catName?.name ?? 'A category'} over budget`,
      body: `${formatMoney(over)} over your ${formatMoney(budgetCents)} budget this month.`,
      url: '/budgets',
      tag: `maple-budget-${budgetCatId}`,
    })
  }
}
