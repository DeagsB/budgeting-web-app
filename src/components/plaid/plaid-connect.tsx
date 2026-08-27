'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { usePlaidLink, type PlaidLinkOnSuccessMetadata } from 'react-plaid-link'
import { Button } from '@/components/ui/button'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP, type AccountType } from '@/lib/domain'
import {
  clearOAuthState,
  isOAuthReturn,
  persistOAuthState,
  readOAuthResume,
  type OAuthResume,
} from '@/lib/plaid-oauth'
import {
  createLinkToken,
  createUpdateLinkToken,
  exchangePublicToken,
  saveAccountMapping,
  triggerPlaidSync,
  type PlaidAccountChoice,
  type AccountMapping,
} from '@/app/(app)/transactions/import/plaid-setup/actions'

/*
 * Plaid Link, shared by the settings page (/transactions/import/plaid-setup),
 * onboarding step 2 and the OAuth return page. Three pieces:
 *
 *   <PlaidConnect>       "Connect a bank" button -> Link -> exchange -> mapping
 *   <AccountMappingForm> map Plaid accounts onto Maple accounts, then Link & sync
 *   usePlaidReauth()     update-mode Link for an item that needs re-authentication
 *
 * OAuth resume: whichever of PlaidConnect / usePlaidReauth matches the stored
 * mode re-opens Link when the URL carries oauth_state_id.
 */

export type PlaidAccountView = {
  id: string
  name: string
  last_four: string | null
  plaid_account_id: string | null
  plaid_item_id: string | null
}

function storage(): Storage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function search(): string {
  return typeof window === 'undefined' ? '' : window.location.search
}

/** Read the persisted resume state once, synchronously, for the given mode. */
function resumeFor(mode: 'connect' | 'update', fallbackReturnTo: string): OAuthResume | null {
  const r = readOAuthResume(search(), storage(), fallbackReturnTo)
  return r && r.mode === mode ? r : null
}

/** Drop persisted state and strip ?oauth_state_id so a refresh can't replay a spent flow. */
function finishOAuth() {
  clearOAuthState(storage())
  if (typeof window !== 'undefined' && isOAuthReturn(window.location.search)) {
    window.history.replaceState({}, '', window.location.pathname)
  }
}

// ─── Connect ────────────────────────────────────────────────────────────────

export function PlaidConnect({
  plaidConfigured,
  atCap,
  maxItems,
  linkedCount,
  accounts,
  canOwn,
  returnTo,
  onLinked,
  variant = 'card',
  connectLabel = 'Connect a bank',
}: {
  plaidConfigured: boolean
  atCap: boolean
  maxItems: number
  linkedCount: number
  /** Existing Maple accounts, offered as "link to existing" targets. */
  accounts: PlaidAccountView[]
  /** False until this login has claimed a member; then only joint accounts can be created. */
  canOwn: boolean
  /** In-app path to land on after an OAuth bounce (persisted before Link opens). */
  returnTo: string
  /** After accounts are mapped and the first sync kicked off. Defaults to router.refresh(). */
  onLinked?: (itemRowId: string) => void
  /** `card` = bordered leaf-tint section (settings); `plain` = bare, for an existing card. */
  variant?: 'card' | 'plain'
  connectLabel?: string
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Resume a fresh-connect OAuth flow after the bank redirects back.
  const [resume] = useState(() => resumeFor('connect', returnTo))
  const [linkToken, setLinkToken] = useState<string | null>(resume?.token ?? null)
  const wantOpenRef = useRef(resume !== null)

  // After a successful connect, hold the accounts to map.
  const [mapping, setMapping] = useState<{ itemRowId: string; choices: PlaidAccountChoice[] } | null>(null)

  const onSuccess = useCallback(
    (publicToken: string, metadata: PlaidLinkOnSuccessMetadata) => {
      finishOAuth()
      start(async () => {
        const res = await exchangePublicToken(publicToken, {
          name: metadata.institution?.name ?? null,
          id: metadata.institution?.institution_id ?? null,
        })
        if (res && 'ok' in res) {
          setMapping({ itemRowId: res.itemRowId, choices: res.accounts })
        } else {
          setError((res && 'error' in res ? res.error : null) ?? 'Could not connect the bank.')
        }
      })
    },
    [],
  )

  // Abandoned (incl. cancelled OAuth) - drop the spent token so a later attempt starts clean.
  const onExit = useCallback(() => finishOAuth(), [])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
    // On return from an OAuth bank, Link reads the redirect (with oauth_state_id)
    // back off the URL to resume the in-flight session.
    ...(resume ? { receivedRedirectUri: window.location.href } : {}),
  })

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
    wantOpenRef.current = true
    start(async () => {
      const res = await createLinkToken()
      if (res && 'ok' in res) {
        persistOAuthState(storage(), { token: res.linkToken, mode: 'connect', returnTo })
        setLinkToken(res.linkToken)
      } else {
        wantOpenRef.current = false
        setError((res && 'error' in res ? res.error : null) ?? 'Could not start Plaid.')
      }
    })
  }

  const connectBlock = (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-leaf">
            {linkedCount} of {maxItems} banks linked
          </div>
          <p className="mt-1 max-w-[520px] text-[13.5px] leading-relaxed text-ink-2">
            Connect securely through Plaid. Your credentials go to your bank, never to Maple - we
            only receive read-only transactions.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          size="md"
          disabled={!plaidConfigured || atCap || pending}
          onClick={connect}
          className="w-full shrink-0 sm:w-auto"
        >
          {pending ? 'Working…' : atCap ? 'Limit reached' : connectLabel}
        </Button>
      </div>
      {atCap && (
        <p className="mt-2 text-[12px] text-ink-3">
          You’ve reached the free-tier limit of {maxItems} banks. Disconnect one to add another.
        </p>
      )}
    </>
  )

  return (
    <div className="flex flex-col gap-5">
      {variant === 'card' ? (
        <section className="rounded-lg border border-hair bg-leaf-tint p-5 md:p-6">{connectBlock}</section>
      ) : (
        <div>{connectBlock}</div>
      )}

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

      {mapping && (
        <AccountMappingForm
          itemRowId={mapping.itemRowId}
          choices={mapping.choices}
          accounts={accounts}
          canOwn={canOwn}
          onCancel={() => setMapping(null)}
          onSaved={(itemRowId) => {
            setMapping(null)
            setNotice('Bank linked. Transactions are syncing in.')
            if (onLinked) onLinked(itemRowId)
            else router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ─── Account mapping ────────────────────────────────────────────────────────

type DraftMapping = {
  choice: PlaidAccountChoice
  kind: 'existing' | 'create' | 'skip'
  existingAccountId: string
  createType: AccountType
  createOwnership: 'member' | 'shared'
}

// Default each Plaid account to an existing match by last-4, else "create".
function initDraft(choice: PlaidAccountChoice, accounts: PlaidAccountView[]): DraftMapping {
  const byMask = choice.mask
    ? accounts.find((a) => a.last_four === choice.mask && !a.plaid_account_id)
    : undefined
  return {
    choice,
    kind: byMask ? 'existing' : 'create',
    existingAccountId: byMask?.id ?? '',
    createType: choice.suggestedType,
    createOwnership: 'shared',
  }
}

/**
 * Map each account from a bank onto a Maple account (existing, new, or skip),
 * then link + kick off the first sync. Used right after a connect and again
 * when Plaid reports new accounts at an already-linked bank.
 */
export function AccountMappingForm({
  itemRowId,
  choices,
  accounts,
  canOwn,
  onSaved,
  onCancel,
}: {
  itemRowId: string
  choices: PlaidAccountChoice[]
  accounts: PlaidAccountView[]
  canOwn: boolean
  onSaved: (itemRowId: string) => void
  onCancel: () => void
}) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<DraftMapping[]>(() => choices.map((c) => initDraft(c, accounts)))

  function patch(i: number, p: Partial<DraftMapping>) {
    setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...p } : d)))
  }

  function save() {
    setError(null)
    const payload: AccountMapping[] = drafts.map((d) => ({
      plaid_account_id: d.choice.plaid_account_id,
      name: d.choice.name,
      mask: d.choice.mask,
      suggestedType: d.choice.suggestedType,
      target:
        d.kind === 'existing'
          ? { kind: 'existing' as const, accountId: d.existingAccountId }
          : d.kind === 'create'
            ? { kind: 'create' as const, type: d.createType, ownership: d.createOwnership }
            : { kind: 'skip' as const },
    }))
    start(async () => {
      const res = await saveAccountMapping(itemRowId, payload)
      if (res && 'ok' in res) onSaved(itemRowId)
      else setError(res?.error ?? 'Could not save the mapping.')
    })
  }

  return (
    <section className="rounded-lg border border-leaf bg-paper p-5 md:p-6">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">Match accounts</div>
      <p className="mt-1 text-[13px] text-ink-2">
        Map each account from this bank onto a Maple account, or create a new one.
      </p>
      <ul className="mt-3 flex flex-col gap-3">
        {drafts.map((d, i) => (
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
                onChange={(e) => patch(i, { kind: e.target.value as DraftMapping['kind'] })}
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
                  onChange={(e) => patch(i, { existingAccountId: e.target.value })}
                >
                  <option value="">- Choose an account -</option>
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
                    onChange={(e) => patch(i, { createType: e.target.value as AccountType })}
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
                    onChange={(e) => patch(i, { createOwnership: e.target.value as 'member' | 'shared' })}
                  >
                    {ACCOUNT_OWNERSHIP.filter((o) => canOwn || o.value === 'shared').map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-maple-soft px-3 py-2 text-[12.5px] font-medium text-maple">
          {error}
        </p>
      )}
      <div className="mt-4 flex items-center gap-2">
        <Button type="button" variant="primary" size="md" disabled={pending} onClick={save}>
          {pending ? 'Saving…' : 'Link & sync'}
        </Button>
        <Button type="button" variant="ghost" size="md" disabled={pending} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  )
}

// ─── Re-authentication (update mode) ────────────────────────────────────────

/**
 * Update-mode Link for an item whose login expired. `start(itemId)` opens
 * Link; on success the item is synced and `onDone` fires. Also resumes an
 * update-mode OAuth bounce on mount.
 */
export function usePlaidReauth({
  returnTo,
  onDone,
  onError,
}: {
  returnTo: string
  onDone: (itemId: string | null, resumedReturnTo: string | null) => void
  onError: (message: string) => void
}) {
  const [pending, startTransition] = useTransition()
  const [resume] = useState(() => resumeFor('update', returnTo))
  const [linkToken, setLinkToken] = useState<string | null>(resume?.token ?? null)
  const itemRef = useRef<string | null>(resume?.itemId ?? null)
  const wantOpenRef = useRef(resume !== null)
  const resumedReturnTo = resume?.returnTo ?? null

  const onSuccess = useCallback(() => {
    finishOAuth()
    const id = itemRef.current
    startTransition(async () => {
      if (id) await triggerPlaidSync(id)
      onDone(id, resumedReturnTo)
    })
  }, [onDone, resumedReturnTo])

  const onExit = useCallback(() => finishOAuth(), [])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
    ...(resume ? { receivedRedirectUri: window.location.href } : {}),
  })

  useEffect(() => {
    if (linkToken && ready && wantOpenRef.current) {
      wantOpenRef.current = false
      open()
    }
  }, [linkToken, ready, open])

  function start(itemId: string) {
    itemRef.current = itemId
    wantOpenRef.current = true
    startTransition(async () => {
      const res = await createUpdateLinkToken(itemId)
      if (res && 'ok' in res) {
        persistOAuthState(storage(), { token: res.linkToken, mode: 'update', itemId, returnTo })
        setLinkToken(res.linkToken)
      } else {
        wantOpenRef.current = false
        onError((res && 'error' in res ? res.error : null) ?? 'Could not start re-authentication.')
      }
    })
  }

  return { start, pending, resuming: resume !== null }
}
