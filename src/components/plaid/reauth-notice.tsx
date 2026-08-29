import Link from 'next/link'
import {
  plaidAttentionReason,
  plaidReconnectHref,
  type PlaidAttentionItem,
} from '@/lib/plaid-attention'

/**
 * Banner shown wherever money is displayed when a linked bank has stopped
 * feeding transactions and balances. One tap goes straight to update-mode
 * Link for that bank (the plaid-setup page reads `?reauth=<id>` and opens
 * Link on load). Renders nothing when every bank is healthy.
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
  const title = single
    ? `${single.institution_name ?? 'Your bank'} ${plaidAttentionReason(single.status)}`
    : `${items.length} banks need reconnecting`
  return (
    <section
      role="status"
      aria-live="polite"
      className={`flex items-center justify-between gap-3 rounded-lg border border-honey bg-paper-2 px-4 py-3 ${className}`}
    >
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold leading-snug text-ink">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">
          New transactions and balances stopped arriving. Reconnect to resume.
        </div>
      </div>
      <Link
        href={plaidReconnectHref(single?.id)}
        className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-ink px-4 text-[13px] font-semibold text-cream transition-colors hover:bg-ink-2"
      >
        Reconnect
      </Link>
    </section>
  )
}
