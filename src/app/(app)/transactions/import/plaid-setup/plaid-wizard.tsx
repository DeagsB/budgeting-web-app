'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { StatusPill } from '@/components/plaid/status-pill'
import { formatSyncedAt } from '@/lib/relative-time'
import {
  AccountMappingForm,
  PlaidConnect,
  usePlaidReauth,
  type PlaidAccountView,
} from '@/components/plaid/plaid-connect'
import {
  disconnectItem,
  refreshItemAccounts,
  triggerPlaidSync,
  type PlaidAccountChoice,
} from './actions'

const RETURN_TO = '/transactions/import/plaid-setup'

type ItemView = {
  id: string
  institutionName: string
  status: string
  lastSyncedAt: string | null
  errorDetail: string | null
  needsAccountReview: boolean
}
type LogView = {
  id: string
  ran_at: string
  added: number
  modified: number
  removed: number
  reconciled: number
  status: string
  error_detail: string | null
}

/**
 * Bank-sync settings: connect (shared PlaidConnect), the list of connected
 * banks with sync / re-auth / review / disconnect, and recent sync activity.
 */
export function PlaidWizard({
  plaidConfigured,
  maxItems,
  items,
  accounts,
  canOwn,
  log,
  /** From `?reauth=<itemRowId>` (see plaidReconnectHref) - opens update-mode Link for this item once. */
  reauthItemId,
}: {
  plaidConfigured: boolean
  maxItems: number
  items: ItemView[]
  accounts: PlaidAccountView[]
  /** False until this login has claimed a member; then only joint accounts can be created. */
  canOwn: boolean
  log: LogView[]
  reauthItemId?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [review, setReview] = useState<{ itemRowId: string; choices: PlaidAccountChoice[] } | null>(null)

  const reauth = usePlaidReauth({
    returnTo: RETURN_TO,
    onSyncStart: () => {
      setError(null)
      setNotice('Re-authenticated. Syncing…')
    },
    onDone: (_id, _resumedReturnTo, result) => {
      setNotice(
        result
          ? `Reconnected. Synced ${result.added} new transaction${result.added === 1 ? '' : 's'}.`
          : 'Reconnected.',
      )
      router.refresh()
    },
    onError: (message) => {
      setNotice(null)
      setError(message)
    },
  })

  // Auto-open update-mode Link once for a bank sent here via ?reauth=<id>
  // (e.g. from the ReauthNotice banner elsewhere in the app). Guarded so a
  // re-render (or React Strict Mode's double-invoke) can't open it twice, and
  // drops the param once started so a refresh can't replay it.
  const reauthStartedRef = useRef(false)
  useEffect(() => {
    if (!reauthItemId || reauthStartedRef.current || reauth.resuming) return
    reauthStartedRef.current = true
    setError(null)
    setNotice(null)
    reauth.start(reauthItemId)
    const url = new URL(window.location.href)
    url.searchParams.delete('reauth')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    // `reauth` is a fresh object every render (its `start` isn't memoised);
    // only the item id from the URL should ever re-trigger this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reauthItemId])

  function reviewAccounts(itemId: string) {
    setError(null)
    setNotice(null)
    start(async () => {
      const res = await refreshItemAccounts(itemId)
      if (res && 'ok' in res) {
        if (res.accounts.length === 0) {
          setNotice('No new accounts to add.')
          router.refresh()
          return
        }
        setReview({ itemRowId: itemId, choices: res.accounts })
      } else {
        setError((res && 'error' in res ? res.error : null) ?? 'Could not load accounts.')
      }
    })
  }

  function syncNow(itemId?: string) {
    setError(null)
    setNotice(null)
    start(async () => {
      const res = await triggerPlaidSync(itemId)
      if (res && 'ok' in res) {
        setNotice(
          res.loginRequired
            ? 'A bank needs re-authentication.'
            : res.skipped
              ? 'Nothing to sync right now.'
              : `Synced - ${res.added} new, ${res.reconciled} enriched${
                  res.transfersPaired > 0
                    ? `, ${res.transfersPaired} transfer${res.transfersPaired === 1 ? '' : 's'} matched`
                    : ''
                }.`,
        )
        router.refresh()
      } else {
        setError(res?.error ?? 'Sync failed.')
      }
    })
  }

  const busy = pending || reauth.pending

  return (
    <div className="flex flex-col gap-5">
      <PlaidConnect
        plaidConfigured={plaidConfigured}
        atCap={items.length >= maxItems}
        maxItems={maxItems}
        linkedCount={items.length}
        accounts={accounts}
        canOwn={canOwn}
        returnTo={RETURN_TO}
      />

      {error && (
        <p role="alert" className="rounded-md bg-maple-soft px-3 py-2 text-[12.5px] font-medium text-maple">
          {error}
        </p>
      )}
      {notice && !error && (
        <p aria-live="polite" className="rounded-md bg-leaf-soft px-3 py-2 text-[12.5px] font-medium text-leaf-deep">
          {notice}
        </p>
      )}

      {/* New accounts at an already-linked bank */}
      {review && (
        <AccountMappingForm
          itemRowId={review.itemRowId}
          choices={review.choices}
          accounts={accounts}
          canOwn={canOwn}
          onCancel={() => setReview(null)}
          onSaved={() => {
            setReview(null)
            setNotice('Accounts linked. Transactions are syncing in.')
            router.refresh()
          }}
        />
      )}

      {/* Connected banks */}
      {items.length > 0 && (
        <section className="rounded-lg border border-hair bg-paper p-5 md:p-6">
          <div className="flex items-center justify-between">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
              Connected banks
            </div>
            <button
              type="button"
              onClick={() => syncNow()}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center text-[12.5px] font-semibold text-ink-2 hover:text-ink hover:underline disabled:opacity-50"
            >
              Sync all
            </button>
          </div>
          <ul className="mt-2 divide-y divide-hair">
            {items.map((it) => {
              const mapped = accounts.filter((a) => a.plaid_item_id === it.id)
              return (
                <li key={it.id} className="flex flex-col gap-2 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[14px] font-semibold text-ink">{it.institutionName}</span>
                        <StatusPill status={it.status} />
                      </div>
                      <div className="mt-0.5 text-[12px] text-ink-3">
                        {mapped.length > 0
                          ? mapped.map((a) => a.name).join(', ')
                          : 'No accounts mapped yet'}
                        {it.lastSyncedAt ? ` · ${formatSyncedAt(it.lastSyncedAt)}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => syncNow(it.id)}
                      disabled={busy}
                      className="inline-flex min-h-[44px] items-center rounded-full border border-hair bg-cream px-3 text-[12.5px] font-semibold text-ink hover:bg-leaf-soft disabled:opacity-50"
                    >
                      Sync now
                    </button>
                    {(it.status === 'login_required' || it.status === 'pending_disconnect') && (
                      <button
                        type="button"
                        onClick={() => {
                          setError(null)
                          setNotice(null)
                          reauth.start(it.id)
                        }}
                        disabled={busy}
                        className="inline-flex min-h-[44px] items-center rounded-full border border-honey bg-paper-2 px-3 text-[12.5px] font-semibold text-down hover:underline disabled:opacity-50"
                      >
                        Reconnect
                      </button>
                    )}
                    {/* A bank with nothing mapped syncs nothing: "Choose
                        accounts" is the way back into the picker, whether
                        the sync flagged it or the user simply left before
                        mapping. */}
                    {(mapped.length === 0 || it.needsAccountReview) && it.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => reviewAccounts(it.id)}
                        disabled={busy}
                        className={
                          mapped.length === 0
                            ? 'inline-flex min-h-[44px] items-center rounded-full bg-ink px-3 text-[12.5px] font-semibold text-cream hover:bg-ink-2 disabled:opacity-50'
                            : 'inline-flex min-h-[44px] items-center rounded-full border border-honey bg-paper-2 px-3 text-[12.5px] font-semibold text-down hover:underline disabled:opacity-50'
                        }
                      >
                        {mapped.length === 0 ? 'Choose accounts' : 'Review new accounts'}
                      </button>
                    )}
                    <ConfirmButton
                      action={async () => {
                        await disconnectItem(it.id)
                        router.refresh()
                      }}
                      prompt={`Disconnect ${it.institutionName}?`}
                      description="Stops syncing and removes the secure connection. Your accounts and their existing transactions stay - they just won’t update automatically."
                      confirmLabel="Disconnect"
                      destructive
                      className="inline-flex min-h-[44px] items-center px-2 text-[12.5px] font-semibold text-maple hover:underline"
                    >
                      Disconnect
                    </ConfirmButton>
                  </div>
                  {it.status === 'error' && it.errorDetail && (
                    <p className="text-[11.5px] text-maple">{it.errorDetail}</p>
                  )}
                  {it.status === 'revoked' && (
                    <p className="text-[11.5px] text-ink-2">
                      Access was revoked at the bank. Disconnect this entry, then add the bank again to reconnect.
                    </p>
                  )}
                  {it.status === 'pending_disconnect' && (
                    <p className="text-[11.5px] text-ink-2">
                      The bank is about to drop this connection. Reconnect to keep syncing.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Recent sync activity */}
      {log.length > 0 && (
        <section className="rounded-lg border border-hair bg-cream-2 p-5 md:p-6">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Recent syncs
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {log.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 text-[12.5px]">
                <span className="text-ink-3">{formatSyncedAt(l.ran_at)}</span>
                <span className="flex items-center gap-2">
                  <StatusPill status={l.status} />
                  <span className="text-ink-2">
                    +{l.added} new · {l.reconciled} enriched
                    {l.removed > 0 ? ` · ${l.removed} removed` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
