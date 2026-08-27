import Link from 'next/link'
import { MapleLabel } from '@/components/ui/label'
import { StatusPill } from '@/components/plaid/status-pill'

export type BankConnection = {
  id: string
  institutionName: string
  status: string
  lastSyncedAt: string | null
  needsAccountReview: boolean
  accountNames: string[]
}

function relative(iso: string | null): string {
  if (!iso) return 'never synced'
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return 'synced just now'
  if (min < 60) return `synced ${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `synced ${h} h ago`
  const d = Math.round(h / 24)
  return `synced ${d} d ago`
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
          {items.map((it) => (
            <li key={it.id} className="flex min-h-[52px] items-center justify-between gap-3 py-2.5">
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
              <span className="shrink-0 text-[12px] text-ink-3">{relative(it.lastSyncedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
