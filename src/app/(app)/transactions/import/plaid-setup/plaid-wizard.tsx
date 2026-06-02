'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP, type AccountType } from '@/lib/domain'
import {
  createLinkToken,
  createUpdateLinkToken,
  exchangePublicToken,
  saveAccountMapping,
  disconnectItem,
  triggerPlaidSync,
  type PlaidAccountChoice,
  type AccountMapping,
} from './actions'

type ItemView = {
  id: string
  institutionName: string
  status: string
  lastSyncedAt: string | null
  errorDetail: string | null
}
type AccountView = {
  id: string
  name: string
  last_four: string | null
  plaid_account_id: string | null
  plaid_item_id: string | null
}
type MemberView = { id: string; name: string }
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

// OAuth banks (RBC, TD, Scotia…) bounce the browser to the bank's own site and
// back. The page fully unloads, so the link_token + mode must survive in
// localStorage to resume Link on return.
const OAUTH_TOKEN_KEY = 'maple.plaid.linkToken'
const OAUTH_MODE_KEY = 'maple.plaid.mode'
const OAUTH_ITEM_KEY = 'maple.plaid.updateItem'

function isOAuthReturn() {
  return typeof window !== 'undefined' && window.location.search.includes('oauth_state_id')
}

function clearOAuthArtifacts() {
  try {
    localStorage.removeItem(OAUTH_TOKEN_KEY)
    localStorage.removeItem(OAUTH_MODE_KEY)
    localStorage.removeItem(OAUTH_ITEM_KEY)
  } catch {
    /* private mode / storage disabled — nothing to clean */
  }
  // Strip ?oauth_state_id so a refresh doesn't try to resume a spent flow.
  if (isOAuthReturn()) {
    window.history.replaceState({}, '', window.location.pathname)
  }
}

type DraftMapping = {
  choice: PlaidAccountChoice
  kind: 'existing' | 'create' | 'skip'
  existingAccountId: string
  createType: AccountType
  createOwnership: 'member' | 'shared'
  createMemberId: string
}

export function PlaidWizard({
  plaidConfigured,
  maxItems,
  items,
  accounts,
  members,
  log,
}: {
  plaidConfigured: boolean
  maxItems: number
  items: ItemView[]
  accounts: AccountView[]
  members: MemberView[]
  log: LogView[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [linkToken, setLinkToken] = useState<string | null>(null)
  const modeRef = useRef<'connect' | 'update'>('connect')
  const updateItemRef = useRef<string | null>(null)
  const wantOpenRef = useRef(false)

  // After a successful connect, hold the accounts to map.
  const [mapping, setMapping] = useState<{ itemRowId: string; drafts: DraftMapping[] } | null>(null)

  const atCap = items.length >= maxItems

  const onSuccess = useCallback(
    (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      clearOAuthArtifacts()
      if (modeRef.current === 'update') {
        const id = updateItemRef.current
        setNotice('Re-authenticated. Syncing…')
        start(async () => {
          if (id) await triggerPlaidSync(id)
          router.refresh()
        })
        return
      }
      start(async () => {
        const res = await exchangePublicToken(publicToken, {
          name: metadata.institution?.name ?? null,
          id: metadata.institution?.institution_id ?? null,
        })
        if (res && 'ok' in res) {
          setMapping({ itemRowId: res.itemRowId, drafts: res.accounts.map((c) => initDraft(c, accounts)) })
        } else {
          setError((res && 'error' in res ? res.error : null) ?? 'Could not connect the bank.')
        }
      })
    },
    [router, accounts],
  )

  const onExit = useCallback(() => {
    // Abandoned (incl. cancelled OAuth) — drop the spent token so a later
    // attempt starts clean.
    clearOAuthArtifacts()
  }, [])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
    // On return from an OAuth bank, Link reads the redirect (with oauth_state_id)
    // back off the URL to resume the in-flight session.
    ...(isOAuthReturn() ? { receivedRedirectUri: window.location.href } : {}),
  })

  // Resume an OAuth flow after the bank redirects back: restore the persisted
  // token + mode and re-open Link to complete the handshake.
  useEffect(() => {
    if (!isOAuthReturn()) return
    let savedToken: string | null = null
    try {
      savedToken = localStorage.getItem(OAUTH_TOKEN_KEY)
      modeRef.current = localStorage.getItem(OAUTH_MODE_KEY) === 'update' ? 'update' : 'connect'
      updateItemRef.current = localStorage.getItem(OAUTH_ITEM_KEY)
    } catch {
      /* storage unavailable */
    }
    if (savedToken) {
      wantOpenRef.current = true
      setLinkToken(savedToken)
    }
  }, [])

  // Open Link once the token is set and the SDK is ready.
  useEffect(() => {
    if (linkToken && ready && wantOpenRef.current) {
      wantOpenRef.current = false
      open()
    }
  }, [linkToken, ready, open])

  function connect() {
    if (atCap) return
    setError(null)
    setNotice(null)
    modeRef.current = 'connect'
    wantOpenRef.current = true
    start(async () => {
      const res = await createLinkToken()
      if (res && 'ok' in res) {
        // Persist so an OAuth bounce to the bank can resume on return.
        try {
          localStorage.setItem(OAUTH_TOKEN_KEY, res.linkToken)
          localStorage.setItem(OAUTH_MODE_KEY, 'connect')
          localStorage.removeItem(OAUTH_ITEM_KEY)
        } catch {
          /* storage unavailable — non-OAuth banks still work */
        }
        setLinkToken(res.linkToken)
      } else {
        wantOpenRef.current = false
        setError((res && 'error' in res ? res.error : null) ?? 'Could not start Plaid.')
      }
    })
  }

  function reauth(itemId: string) {
    setError(null)
    setNotice(null)
    modeRef.current = 'update'
    updateItemRef.current = itemId
    wantOpenRef.current = true
    start(async () => {
      const res = await createUpdateLinkToken(itemId)
      if (res && 'ok' in res) {
        try {
          localStorage.setItem(OAUTH_TOKEN_KEY, res.linkToken)
          localStorage.setItem(OAUTH_MODE_KEY, 'update')
          localStorage.setItem(OAUTH_ITEM_KEY, itemId)
        } catch {
          /* storage unavailable */
        }
        setLinkToken(res.linkToken)
      } else {
        wantOpenRef.current = false
        setError((res && 'error' in res ? res.error : null) ?? 'Could not start re-authentication.')
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
            : `Synced — ${res.added} new, ${res.reconciled} enriched.`,
        )
        router.refresh()
      } else {
        setError(res?.error ?? 'Sync failed.')
      }
    })
  }

  function saveMapping() {
    if (!mapping) return
    setError(null)
    const payload: AccountMapping[] = mapping.drafts.map((d) => ({
      plaid_account_id: d.choice.plaid_account_id,
      name: d.choice.name,
      mask: d.choice.mask,
      suggestedType: d.choice.suggestedType,
      target:
        d.kind === 'existing'
          ? { kind: 'existing' as const, accountId: d.existingAccountId }
          : d.kind === 'create'
            ? {
                kind: 'create' as const,
                type: d.createType,
                ownership: d.createOwnership,
                memberId: d.createOwnership === 'member' ? d.createMemberId || null : null,
              }
            : { kind: 'skip' as const },
    }))
    start(async () => {
      const res = await saveAccountMapping(mapping.itemRowId, payload)
      if (res && 'ok' in res) {
        setMapping(null)
        setNotice('Bank linked. Transactions are syncing in.')
        router.refresh()
      } else {
        setError(res?.error ?? 'Could not save the mapping.')
      }
    })
  }

  function patchDraft(i: number, patch: Partial<DraftMapping>) {
    setMapping((prev) =>
      prev ? { ...prev, drafts: prev.drafts.map((d, j) => (j === i ? { ...d, ...patch } : d)) } : prev,
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Connect */}
      <section className="rounded-lg border border-hair bg-leaf-tint p-5 md:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-leaf">
              {items.length} of {maxItems} banks linked
            </div>
            <p className="mt-1 max-w-[520px] text-[13.5px] leading-relaxed text-ink-2">
              Connect securely through Plaid. Your credentials go to your bank, never to Maple — we
              only receive read-only transactions.
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="md"
            disabled={!plaidConfigured || atCap || pending}
            onClick={connect}
            className="shrink-0"
          >
            {pending ? 'Working…' : atCap ? 'Limit reached' : 'Connect a bank'}
          </Button>
        </div>
        {atCap && (
          <p className="mt-2 text-[12px] text-ink-3">
            You’ve reached the free-tier limit of {maxItems} banks. Disconnect one to add another.
          </p>
        )}
      </section>

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

      {/* Account mapping (after connect) */}
      {mapping && (
        <section className="rounded-lg border border-leaf bg-paper p-5 md:p-6">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
            Match accounts
          </div>
          <p className="mt-1 text-[13px] text-ink-2">
            Map each account from this bank onto a Maple account, or create a new one.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {mapping.drafts.map((d, i) => (
              <li key={d.choice.plaid_account_id} className="rounded-md border border-hair bg-cream-2 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[14px] font-semibold text-ink">{d.choice.name}</span>
                  <span className="shrink-0 text-[12px] text-ink-3">
                    {d.choice.subtype ?? d.choice.type}
                    {d.choice.mask ? ` ····${d.choice.mask}` : ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  <select
                    aria-label={`How to map ${d.choice.name}`}
                    className="maple-select"
                    value={d.kind}
                    onChange={(e) => patchDraft(i, { kind: e.target.value as DraftMapping['kind'] })}
                  >
                    <option value="create">Create a new Maple account</option>
                    <option value="existing">Link to an existing account</option>
                    <option value="skip">Don’t import this account</option>
                  </select>

                  {d.kind === 'existing' && (
                    <select
                      aria-label={`Existing account for ${d.choice.name}`}
                      className="maple-select"
                      value={d.existingAccountId}
                      onChange={(e) => patchDraft(i, { existingAccountId: e.target.value })}
                    >
                      <option value="">— Choose an account —</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                          {a.last_four ? ` ····${a.last_four}` : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  {d.kind === 'create' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        aria-label={`Type for ${d.choice.name}`}
                        className="maple-select"
                        value={d.createType}
                        onChange={(e) => patchDraft(i, { createType: e.target.value as AccountType })}
                      >
                        {ACCOUNT_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <select
                        aria-label={`Owner for ${d.choice.name}`}
                        className="maple-select"
                        value={d.createOwnership}
                        onChange={(e) =>
                          patchDraft(i, { createOwnership: e.target.value as 'member' | 'shared' })
                        }
                      >
                        {ACCOUNT_OWNERSHIP.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      {d.createOwnership === 'member' && (
                        <select
                          aria-label={`Member for ${d.choice.name}`}
                          className="maple-select sm:col-span-2"
                          value={d.createMemberId}
                          onChange={(e) => patchDraft(i, { createMemberId: e.target.value })}
                        >
                          <option value="">— Choose a member —</option>
                          {members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex items-center gap-2">
            <Button type="button" variant="primary" size="md" disabled={pending} onClick={saveMapping}>
              {pending ? 'Saving…' : 'Link & sync'}
            </Button>
            <Button type="button" variant="ghost" size="md" disabled={pending} onClick={() => setMapping(null)}>
              Cancel
            </Button>
          </div>
        </section>
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
              disabled={pending}
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
                        {it.lastSyncedAt ? ` · synced ${it.lastSyncedAt.replace('T', ' ').slice(0, 16)}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => syncNow(it.id)}
                      disabled={pending}
                      className="inline-flex min-h-[44px] items-center rounded-full border border-hair bg-cream px-3 text-[12.5px] font-semibold text-ink hover:bg-leaf-soft disabled:opacity-50"
                    >
                      Sync now
                    </button>
                    {it.status === 'login_required' && (
                      <button
                        type="button"
                        onClick={() => reauth(it.id)}
                        disabled={pending}
                        className="inline-flex min-h-[44px] items-center rounded-full border border-honey bg-paper-2 px-3 text-[12.5px] font-semibold text-down hover:underline disabled:opacity-50"
                      >
                        Re-authenticate
                      </button>
                    )}
                    <ConfirmButton
                      action={async () => {
                        await disconnectItem(it.id)
                        router.refresh()
                      }}
                      prompt={`Disconnect ${it.institutionName}?`}
                      description="Stops syncing and removes the secure connection. Your accounts and their existing transactions stay — they just won’t update automatically."
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
                <span className="text-ink-3">{l.ran_at.replace('T', ' ').slice(0, 16)}</span>
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

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Active', cls: 'bg-leaf-soft text-leaf-deep' },
    ok: { label: 'OK', cls: 'bg-leaf-soft text-leaf-deep' },
    login_required: { label: 'Re-auth needed', cls: 'bg-paper-2 text-down' },
    error: { label: 'Error', cls: 'bg-maple-soft text-maple' },
    webhook_rejected: { label: 'Rejected', cls: 'bg-maple-soft text-maple' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-paper-2 text-ink-3' }
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${s.cls}`}>
      {s.label}
    </span>
  )
}

// Default each Plaid account to an existing match by last-4, else "create".
function initDraft(choice: PlaidAccountChoice, accounts: AccountView[]): DraftMapping {
  const byMask = choice.mask
    ? accounts.find((a) => a.last_four === choice.mask && !a.plaid_account_id)
    : undefined
  return {
    choice,
    kind: byMask ? 'existing' : 'create',
    existingAccountId: byMask?.id ?? '',
    createType: choice.suggestedType,
    createOwnership: 'shared',
    createMemberId: '',
  }
}
