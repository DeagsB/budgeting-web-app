'use client'

import { useActionState, useEffect, useRef, useState } from 'react'
import { createTransaction } from './actions'
import { Button } from '@/components/ui/button'
import { SheetActions } from '@/components/ui/sheet'
import { useToast } from '@/components/ui/toast'
import { useRunAction } from '@/lib/run-action'
import { formatMoney, parseMoneyToCents } from '@/lib/format'

// Local form state. The server action returns `{ error }` on failure and
// `undefined` on success; we map success to an explicit `{ ok: true }` so the
// post-submit effect can tell "saved" apart from "never submitted".
type FormState = { error: string } | { ok: true } | undefined

type Category = { id: string; parent_id: string | null; name: string }

// ─── Prefs remembered across visits (localStorage) ─────────────────────────

const LAST_ACCOUNT_KEY = 'maple.lastAccount.v1'
const RECENT_CATEGORIES_KEY = 'maple.recentCategories.v1'
const RECENT_CATEGORIES_MAX = 5

function readLastAccountId(): string | null {
  try {
    return localStorage.getItem(LAST_ACCOUNT_KEY)
  } catch {
    return null /* private mode / storage disabled */
  }
}

function rememberLastAccountId(id: string) {
  try {
    localStorage.setItem(LAST_ACCOUNT_KEY, id)
  } catch {
    /* private mode / storage disabled */
  }
}

function readRecentCategoryIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_CATEGORIES_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function rememberRecentCategoryId(id: string) {
  try {
    const next = [id, ...readRecentCategoryIds().filter((x) => x !== id)].slice(0, RECENT_CATEGORIES_MAX)
    localStorage.setItem(RECENT_CATEGORIES_KEY, JSON.stringify(next))
  } catch {
    /* private mode / storage disabled */
  }
}

function resolveDefaultAccountId(accounts: { id: string; name: string }[], fromDraft?: string): string {
  if (fromDraft && accounts.some((a) => a.id === fromDraft)) return fromDraft
  const lastUsed = readLastAccountId()
  if (lastUsed && accounts.some((a) => a.id === lastUsed)) return lastUsed
  return accounts[0]?.id ?? ''
}

// ─── Half-typed draft (module state, not localStorage - see task notes) ────
//
// The `<Sheet>` this form lives in fully unmounts on close (not just hidden),
// so a stray tap on the scrim or the close button would otherwise throw away
// whatever the user had typed. Module state survives that unmount/remount
// for as long as the page stays loaded; it expires after 5 minutes so a
// draft from a much earlier session doesn't resurface unexpectedly.

type Draft = {
  direction: 'out' | 'in'
  amount: string
  occurred_on: string
  account_id: string
  category_id: string
  description: string
}

const DRAFT_TTL_MS = 5 * 60 * 1000
let draftEntry: { value: Draft; savedAt: number } | null = null

function loadDraft(): Draft | null {
  if (!draftEntry) return null
  if (Date.now() - draftEntry.savedAt > DRAFT_TTL_MS) {
    draftEntry = null
    return null
  }
  return draftEntry.value
}

function saveDraft(value: Draft) {
  draftEntry = { value, savedAt: Date.now() }
}

function clearDraft() {
  draftEntry = null
}

function buildSavedLabel(description: string, categoryId: string, categories: Category[]): string {
  const trimmed = description.trim()
  if (trimmed) return trimmed
  return categories.find((c) => c.id === categoryId)?.name ?? 'Uncategorized'
}

/**
 * Maple "add transaction" inline form.
 *
 * Hero: amount + direction segmented toggle (Spent / Received) - the two
 * most common interactions. Everything else collapses into a tight grid below.
 * Save sits in a `SheetActions` bar so it stays above the on-screen keyboard;
 * a secondary "Save and add another" keeps the sheet open for a quick run of
 * entries (e.g. logging several cash receipts back to back).
 */
export function AddTransactionForm({
  accounts,
  categories,
  onSaved,
}: {
  defaultDate: string
  accounts: { id: string; name: string }[]
  categories: Category[]
  onSaved?: () => void
}) {
  const run = useRunAction()
  const { toast } = useToast()
  const today = new Date()
  const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const [initialDraft] = useState(() => loadDraft())

  const [direction, setDirection] = useState<'out' | 'in'>(initialDraft?.direction ?? 'out')
  const [amount, setAmount] = useState(initialDraft?.amount ?? '')
  const [amountInvalid, setAmountInvalid] = useState(false)
  const [occurredOn, setOccurredOn] = useState(initialDraft?.occurred_on ?? todayISO)
  const [accountId, setAccountId] = useState(() => resolveDefaultAccountId(accounts, initialDraft?.account_id))
  const [categoryId, setCategoryId] = useState(initialDraft?.category_id ?? '')
  const [description, setDescription] = useState(initialDraft?.description ?? '')
  const [recentCategoryIds, setRecentCategoryIds] = useState<string[]>(() => readRecentCategoryIds())

  const amountInputRef = useRef<HTMLInputElement>(null)
  /** True when the just-submitted click was "Save and add another". */
  const addAnotherRef = useRef(false)
  /** Snapshot of what was submitted, captured at submit time - by the time
   * the action resolves the visible fields may already have been reset. */
  const lastSubmitRef = useRef<{ amountCents: number; label: string; accountId: string; categoryId: string } | null>(
    null,
  )

  function finishSuccess(showToast: boolean) {
    const snap = lastSubmitRef.current
    if (snap) {
      rememberLastAccountId(snap.accountId)
      if (snap.categoryId) {
        rememberRecentCategoryId(snap.categoryId)
        setRecentCategoryIds(readRecentCategoryIds())
      }
      if (showToast) {
        toast({ title: `Saved ${formatMoney(snap.amountCents)} to ${snap.label}`, tone: 'leaf' })
      }
    }
    clearDraft()
    if (addAnotherRef.current) {
      setAmount('')
      setDescription('')
      setCategoryId('')
      setAmountInvalid(false)
      amountInputRef.current?.focus()
    } else {
      setAmount('')
      setDirection('out')
      setDescription('')
      setCategoryId('')
      setOccurredOn(todayISO)
      setAmountInvalid(false)
      onSaved?.()
    }
  }

  const [state, formAction, pending] = useActionState<FormState, FormData>(
    async (prev, fd) => {
      // Offline-aware: a network failure keeps the form filled and shows a
      // toast; the save is retried once when the connection returns.
      let deferred = false
      const res = await run(() => createTransaction(undefined, fd), {
        onError: () => {
          deferred = true
        },
        retrySuccessMessage: 'Back online - transaction added.',
        onRetrySuccess: (r) => {
          // The generic reconnect toast above already confirmed the save;
          // no need for our own "Saved $X to Y" toast on top of it.
          if (!r?.error) finishSuccess(false)
        },
      })
      if (deferred) return prev
      return res?.error ? { error: res.error } : { ok: true }
    },
    undefined,
  )

  useEffect(() => {
    if (!pending && state && 'ok' in state) {
      finishSuccess(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, state])

  // Keep a half-typed draft alive across an accidental sheet close. Nothing
  // worth remembering yet clears any leftover draft instead of writing one,
  // so a field the user deliberately emptied doesn't come back either.
  useEffect(() => {
    if (amount.trim() === '' && description.trim() === '') {
      clearDraft()
      return
    }
    saveDraft({
      direction,
      amount,
      occurred_on: occurredOn,
      account_id: accountId,
      category_id: categoryId,
      description,
    })
  }, [direction, amount, occurredOn, accountId, categoryId, description])

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const parsed = parseMoneyToCents(amount)
    if (parsed === null) {
      e.preventDefault()
      setAmountInvalid(true)
      return
    }
    lastSubmitRef.current = {
      amountCents: parsed,
      label: buildSavedLabel(description, categoryId, categories),
      accountId,
      categoryId,
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Direction + amount hero */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex rounded-full bg-paper-2 p-1 sm:w-auto" role="group" aria-label="Transaction direction">
          <input type="hidden" name="direction" value={direction} />
          <SegmentButton active={direction === 'out'} onClick={() => setDirection('out')}>
            Spent
          </SegmentButton>
          <SegmentButton active={direction === 'in'} onClick={() => setDirection('in')}>
            Received
          </SegmentButton>
        </div>

        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-2 rounded-md border border-hair bg-paper px-4 py-2.5 transition-colors focus-within:border-leaf focus-within:shadow-[0_0_0_3px_var(--color-leaf-soft)]">
            <span className="text-[20px] font-serif text-ink-3">$</span>
            <input
              ref={amountInputRef}
              name="amount"
              type="text"
              inputMode="decimal"
              enterKeyHint="done"
              required
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setAmountInvalid(false)
              }}
              onBlur={() => setAmountInvalid(amount.trim() !== '' && parseMoneyToCents(amount) === null)}
              aria-label={`Amount ${direction === 'out' ? 'spent' : 'received'} in dollars`}
              aria-invalid={amountInvalid || undefined}
              aria-describedby={amountInvalid ? 'amount-error' : undefined}
              className="w-full bg-transparent font-serif text-[26px] tabular-nums tracking-[-0.01em] text-ink outline-none placeholder:text-ink-3"
            />
          </span>
          {amountInvalid && (
            <p id="amount-error" role="alert" className="text-[12px] font-medium text-maple">
              Enter dollars and cents, e.g. 12.50
            </p>
          )}
        </label>
      </div>

      {/* Fields grid */}
      {/* The payer is always the signed-in member, so there is no member
          picker: the server action stamps it. */}
      <div className="grid gap-3 sm:grid-cols-6">
        <Field label="Date" span={3}>
          <input
            name="occurred_on"
            type="date"
            required
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
            className="maple-input"
          />
        </Field>

        <Field label="Account" span={3}>
          <select
            name="account_id"
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="maple-select"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category" span={3}>
          <RecentCategorySelect
            name="category_id"
            categories={categories}
            recentIds={recentCategoryIds}
            value={categoryId}
            onChange={setCategoryId}
          />
        </Field>

        <Field label="Description" span={3}>
          <input
            name="description"
            type="text"
            enterKeyHint="done"
            maxLength={500}
            placeholder="Optional"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="maple-input"
          />
        </Field>
      </div>

      <div aria-live="polite">
        {state && 'error' in state && state.error && (
          <div
            role="alert"
            className="rounded-md bg-maple-soft px-3 py-2 text-[13px] font-medium text-maple"
          >
            {state.error}
          </div>
        )}
      </div>

      <SheetActions>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <Button
            type="submit"
            variant="ghost"
            size="md"
            disabled={pending}
            onClick={() => {
              addAnotherRef.current = true
            }}
            className="order-2 sm:order-1"
          >
            {pending ? 'Saving…' : 'Save and add another'}
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={pending}
            onClick={() => {
              addAnotherRef.current = false
            }}
            className="order-1 sm:order-2"
          >
            {pending ? 'Saving…' : 'Add transaction'}
            {!pending && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                <path d="M12 5v14M5 12h14" />
              </svg>
            )}
          </Button>
        </div>
      </SheetActions>
    </form>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  // flex-1 makes both segments share the pill's width evenly, so the active
  // background actually fills its half instead of hugging the label text.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'flex-1 rounded-full px-4 py-2 text-center text-[12.5px] font-semibold transition-all ' +
        (active
          ? 'bg-paper text-ink shadow-[0_1px_2px_rgba(0,0,0,0.06)]'
          : 'text-ink-2 hover:text-ink')
      }
    >
      {children}
    </button>
  )
}

function Field({
  label,
  span,
  children,
}: {
  label: string
  span: number
  children: React.ReactNode
}) {
  const spanClass =
    span === 2 ? 'sm:col-span-2' : span === 3 ? 'sm:col-span-3' : span === 4 ? 'sm:col-span-4' : 'sm:col-span-6'
  return (
    <label className={`flex flex-col gap-1 ${spanClass}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  )
}

/**
 * Category select mirroring `CategorySelect`'s markup/classes (that
 * component isn't ours to extend) with a "Recent" optgroup of the household's
 * five most-used categories pinned first, so the common case rarely needs a
 * scroll through the full hierarchy.
 */
function RecentCategorySelect({
  name,
  categories,
  recentIds,
  value,
  onChange,
}: {
  name: string
  categories: Category[]
  recentIds: string[]
  value: string
  onChange: (v: string) => void
}) {
  const parents = categories.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id)
  const byId = new Map(categories.map((c) => [c.id, c]))
  const recent = recentIds
    .map((id) => byId.get(id))
    .filter((c): c is Category => c !== undefined)

  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="maple-select"
    >
      <option value="">- Uncategorized -</option>
      {recent.length > 0 && (
        <optgroup label="Recent">
          {recent.map((c) => (
            <option key={`recent-${c.id}`} value={c.id}>
              {c.name}
            </option>
          ))}
        </optgroup>
      )}
      {parents.map((p) => {
        const kids = childrenOf(p.id)
        return (
          <optgroup key={p.id} label={p.name}>
            <option value={p.id}>{p.name}</option>
            {kids.map((c) => (
              <option key={c.id} value={c.id}>
                {'  ↳ '}
                {c.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}
