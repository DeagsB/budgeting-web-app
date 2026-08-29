'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useFormStatus } from 'react-dom'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { ownershipLabel } from '@/lib/tx-scope'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { updateAccount, archiveAccount, unarchiveAccount } from './actions'

/** Bank-linked context for a Plaid account row - `null` for a manual account. */
type BankInfo = {
  /** Institution name, or "Bank" when Plaid hasn't reported one. */
  label: string
  /** "synced 2 h ago" / "not synced yet". */
  syncedLabel: string
  needsReconnect: boolean
  reconnectHref: string
}

type Account = {
  id: string
  name: string
  type: string
  typeLabel: string
  ownership: string
  opening_balance_cents: number
  /** Current balance (opening + transactions, snapshot-anchored) - see src/lib/balances.ts. */
  balance_cents: number
  last_four: string | null
  archived: boolean
  /** True when this account is fed by a linked bank via Plaid. */
  linked: boolean
  bank: BankInfo | null
}

/**
 * Small icon glyph per account type - drawn SVG so it inherits the palette.
 * Switches on the real `AccountType` union so registered (tfsa/rrsp/fhsa),
 * investment, and crypto accounts each get a distinct glyph instead of the
 * chequing fallback.
 */
function AccountIcon({ type }: { type: string }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type as AccountType) {
    case 'credit_card':
      return (<svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>)
    case 'savings':
      return (<svg {...common}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" /></svg>)
    case 'loan':
      return (<svg {...common}><path d="M3 12h18M3 6h18M3 18h12" /></svg>)
    case 'crypto':
      return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 8h5a2.5 2.5 0 0 1 0 5H9M9 13h5.5a2.5 2.5 0 0 1 0 5H9M10 6v12M14 6v12" /></svg>)
    case 'tfsa':
    case 'rrsp':
    case 'fhsa':
      // Registered plans - shield to signal tax-sheltered status.
      return (<svg {...common}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></svg>)
    case 'taxable_investment':
      // Investment - growth chart.
      return (<svg {...common}><path d="M3 17l5-5 3 3 7-7M16 6h4v4" /></svg>)
    case 'cash':
      return (<svg {...common}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></svg>)
    case 'chequing':
    default:
      return (<svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h6" /></svg>)
  }
}

/** Tiny bank glyph marking a row as fed by a linked Plaid connection. */
function BankGlyph() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 10h18M5 10v8M9 10v8M15 10v8M19 10v8M3 18h18M12 3l9 5H3l9-5z" />
    </svg>
  )
}

export function AccountRow({ account }: { account: Account }) {
  const [editing, setEditing] = useState(false)

  // ───── EDIT ─────
  if (editing) {
    return (
      <li className="border-b border-hair bg-cream-2/60 px-5 py-4 last:border-b-0">
        <form
          action={async (fd) => {
            await updateAccount(fd)
            setEditing(false)
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={account.id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <EditField label="Name">
              <input
                name="name"
                defaultValue={account.name}
                required
                maxLength={80}
                className="maple-input sm"
              />
            </EditField>
            <EditField label="Type">
              <select name="type" defaultValue={account.type} className="maple-select sm">
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </EditField>
            <EditField label="Ownership">
              <select name="ownership" defaultValue={account.ownership} className="maple-select sm">
                {ACCOUNT_OWNERSHIP.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </EditField>
            {/* Hidden for a linked account: its balance comes from the bank via
                Plaid sync, never from a typed opening figure (src/lib/balances.ts
                isManuallyEditableBalance). The server action leaves the stored
                value untouched when this field isn't submitted. */}
            {!account.linked && (
              <EditField label="Opening balance">
                <div className="flex items-center rounded-md border border-hair bg-paper px-3 py-1.5 transition-colors focus-within:border-leaf">
                  <span className="text-[12px] text-ink-3">$</span>
                  <input
                    name="opening_balance"
                    type="text"
                    inputMode="decimal"
                    defaultValue={(account.opening_balance_cents / 100).toFixed(2)}
                    aria-label="Opening balance in dollars"
                    className="w-full bg-transparent pl-1 text-[13px] tabular-nums text-ink outline-none"
                  />
                </div>
              </EditField>
            )}
            <EditField label="Last 4 digits (auto-routing)">
              <input
                name="last_four"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                defaultValue={account.last_four ?? ''}
                placeholder="1234"
                className="maple-input sm tabular-nums"
              />
            </EditField>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <SubmitButton>Save</SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </li>
    )
  }

  // ───── DISPLAY ─────
  const isLiability = LIABILITY_TYPES.has(account.type as AccountType)

  return (
    <li
      className={
        'flex flex-col gap-3 border-b border-hair px-5 py-3.5 transition-colors last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ' +
        (account.archived ? 'opacity-60' : 'hover:bg-cream-2/40')
      }
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div
          className={
            'mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' +
            (isLiability ? 'bg-maple-soft text-maple' : 'bg-leaf-soft text-leaf')
          }
        >
          <AccountIcon type={account.type} />
        </div>
        <div className="min-w-0 flex-1">
          {/* Line 1: name gets every pixel left after the balance. Long bank
              names ("Home Equity Line of Credit") wrap to a second line
              rather than ellipsize - the name is the one thing the user
              must be able to read to pick the right account. */}
          <div className="flex items-baseline gap-3">
            <div className="line-clamp-2 min-w-0 flex-1 break-words font-medium text-[16px] leading-snug tracking-[-0.01em] text-ink">
              {account.name}
            </div>
            <Amount
              cents={isLiability ? -Math.abs(account.balance_cents) : account.balance_cents}
              sign={isLiability ? 'auto' : 'none'}
              tone={isLiability ? 'maple' : 'ink'}
              className="shrink-0 text-[16px]"
            />
          </div>
          {/* Line 2: type · ownership · last four, always one line. */}
          <div className="mt-0.5 truncate text-[12px] text-ink-3">
            {[
              account.typeLabel,
              ownershipLabel(account.ownership),
              account.last_four ? `····${account.last_four}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {/* Line 3 (linked accounts only): bank caption, or a 44px-tall
              reconnect link when the item needs attention. */}
          {account.bank && (
            account.bank.needsReconnect ? (
              <Link
                href={account.bank.reconnectHref}
                className="-ml-2 mt-0.5 inline-flex min-h-[44px] items-center px-2 text-[12px] font-semibold text-down hover:underline"
              >
                Needs reconnecting →
              </Link>
            ) : (
              <div className="mt-0.5 flex items-center gap-1 truncate text-[12px] text-ink-3">
                <BankGlyph />
                {/* Time first: on a 390px row the tail gets clipped, and
                    "synced 7 min ago" is the part the user came for. */}
                <span className="truncate">
                  {account.bank.syncedLabel} · {account.bank.label}
                </span>
              </div>
            )
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[12px] sm:gap-3">
        {!account.archived && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline"
          >
            Edit
          </button>
        )}
        {account.archived ? (
          <form action={unarchiveAccount}>
            <input type="hidden" name="id" value={account.id} />
            <UnarchiveButton />
          </form>
        ) : (
          <ConfirmButton
            action={archiveAccount}
            formData={{ id: account.id }}
            prompt={`Archive "${account.name}"?`}
            description="Archived accounts are hidden from the active ledger but keep their history. You can unarchive them anytime."
            confirmLabel="Archive"
            destructive
            className="inline-flex min-h-[44px] items-center px-2 font-semibold text-maple hover:underline"
          >
            Archive
          </ConfirmButton>
        )}
      </div>
    </li>
  )
}

function EditField({
  label,
  span,
  children,
}: {
  label: string
  span?: number
  children: React.ReactNode
}) {
  const sc = span === 2 ? 'sm:col-span-2' : ''
  return (
    <label className={`flex flex-col gap-1 ${sc}`}>
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </span>
      {children}
    </label>
  )
}

/** Save button that greys out while the server action runs. Must render inside the <form>. */
function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="primary" size="sm" disabled={pending} aria-busy={pending || undefined}>
      {pending ? 'Saving...' : children}
    </Button>
  )
}

function UnarchiveButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending || undefined}
      className="inline-flex min-h-[44px] items-center px-2 font-semibold text-ink-2 hover:text-ink hover:underline disabled:opacity-50"
    >
      {pending ? 'Restoring...' : 'Unarchive'}
    </button>
  )
}
