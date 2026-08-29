import Link from 'next/link'
import {
  plaidAttentionAction,
  plaidAttentionTitle,
  type PlaidAttentionItem,
} from '@/lib/plaid-attention'

/**
 * Banner shown wherever money is displayed when a linked bank needs the
 * user: a fresh sign-in (one tap opens update-mode Link for that bank via
 * `?reauth=<id>` on the plaid-setup page) or, for a bank that was linked but
 * never had accounts chosen, the account picker. Renders nothing when every
 * bank is healthy.
 */
export function ReauthNotice({
  items,
  className = '',
}: {
  items: PlaidAttentionItem[]
  className?: string
}) {
  if (items.length === 0) return null
  const single = items.length === 1 ? items[0] : null
  const allChoose = items.every((i) => i.kind === 'choose_accounts')
  const allReconnect = items.every((i) => i.kind === 'reconnect')

  const title = single
    ? `${single.institution_name ?? 'Your bank'} ${plaidAttentionTitle(single)}`
    : allChoose
      ? `${items.length} banks have no accounts tracked yet`
      : allReconnect
        ? `${items.length} banks need reconnecting`
        : `${items.length} banks need attention`
  const body = single
    ? single.kind === 'choose_accounts'
      ? 'Pick which accounts to track and its transactions and balances start coming in.'
      : 'New transactions and balances stopped arriving. Reconnect to resume.'
    : 'Open bank sync to sort them out.'
  const action = single
    ? plaidAttentionAction(single)
    : { label: 'Open bank sync', href: '/transactions/import/plaid-setup' }

  return (
    <section
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-3 rounded-lg border border-honey bg-paper-2 px-4 py-3 ${className}`}
    >
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold leading-snug text-ink">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{body}</div>
      </div>
      <Link
        href={action.href}
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-ink px-4 text-[13px] font-semibold text-cream transition-colors hover:bg-ink-2"
      >
        {action.label}
      </Link>
    </section>
  )
}
