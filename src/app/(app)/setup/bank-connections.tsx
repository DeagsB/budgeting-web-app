import Link from 'next/link'
import { MapleLabel } from '@/components/ui/label'
import { StatusPill } from '@/components/plaid/status-pill'
import { formatSyncedAt } from '@/lib/relative-time'
import { plaidReconnectHref } from '@/lib/plaid-attention'

export type BankConnection = {
  id: string
  institutionName: string
  status: string
  lastSyncedAt: string | null
  needsAccountReview: boolean
  accountNames: string[]
  /** False when someone else linked this bank: only they can sign in again. */
  canReconnect: boolean
  /** Display name of the member who linked it, when it is not you. */
  ownerName: string | null
}

/** Setup card: linked banks at a glance, with a link to the full sync page. */
export function BankConnections({ items }: { items: BankConnection[] }) {
  const attention = items.filter(
    (i) => i.status === 'login_required' || i.status === 'error' || i.status === 'revoked' || i.needsAccountReview,
  ).length

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <MapleLabel>Bank connections</MapleLabel>
        <Link
          href="/transactions/import/plaid-setup"
          className="inline-flex min-h-[44px] items-center text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
        >
          {items.length === 0 ? 'Connect a bank →' : 'Manage bank sync →'}
        </Link>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">
        {items.length === 0
          ? 'No banks linked yet. Connect one and transactions sync in automatically, with real merchant names.'
          : attention > 0
            ? `${attention === 1 ? 'One bank needs' : `${attention} banks need`} attention.`
            : 'Syncing automatically. Balances and transactions update on their own.'}
      </p>
      {items.length > 0 && (
        <ul className="mt-3 divide-y divide-hair">
          {items.map((it) => {
            const needsReconnect = it.status === 'login_required' || it.status === 'pending_disconnect'
            return (
              <li key={it.id} className="flex flex-col gap-1.5 py-2.5">
                <div className="flex min-h-[24px] items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-semibold text-ink">{it.institutionName}</span>
                      <StatusPill status={it.status} />
                      {it.needsAccountReview && it.status === 'active' && <StatusPill status="new_accounts" />}
                    </div>
                    <div className="mt-0.5 truncate text-[12px] text-ink-3">
                      {it.accountNames.length > 0 ? it.accountNames.join(', ') : 'No accounts mapped yet'}
                    </div>
                  </div>
                  <span className="shrink-0 text-[12px] text-ink-3">{formatSyncedAt(it.lastSyncedAt)}</span>
                </div>
                {needsReconnect && (
                  <div className="flex items-center justify-between gap-3 rounded-md bg-paper-2 px-2.5 py-1">
                    {/* Reconnecting needs the bank's own credentials, so a
                        member who did not link it is told who to ask rather
                        than handed a button that cannot work for them. */}
                    <span
                      className={`text-[12px] font-medium ${it.canReconnect ? 'text-down' : 'text-ink-2'}`}
                    >
                      {!it.canReconnect
                        ? `${it.ownerName ?? 'Whoever linked this bank'} needs to reconnect it.`
                        : it.status === 'pending_disconnect'
                          ? 'About to disconnect. Reconnect to keep syncing.'
                          : 'Needs reconnecting to keep syncing.'}
                    </span>
                    {it.canReconnect && (
                      <Link
                        href={plaidReconnectHref(it.id)}
                        className="inline-flex min-h-[44px] shrink-0 items-center rounded-full bg-ink px-4 text-[12.5px] font-semibold text-cream transition-colors hover:bg-ink-2"
                      >
                        Reconnect
                      </Link>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
