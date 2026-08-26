'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { updateAccount, archiveAccount, unarchiveAccount } from './actions'

type Account = {
  id: string
  name: string
  type: string
  typeLabel: string
  ownership: string
  member_id: string | null
  memberName: string | null
  opening_balance_cents: number
  last_four: string | null
  archived: boolean
}

/**
 * Small icon glyph per account type — drawn SVG so it inherits the palette.
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
      // Registered plans — shield to signal tax-sheltered status.
      return (<svg {...common}><path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /></svg>)
    case 'taxable_investment':
      // Investment — growth chart.
      return (<svg {...common}><path d="M3 17l5-5 3 3 7-7M16 6h4v4" /></svg>)
    case 'cash':
      return (<svg {...common}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></svg>)
    case 'chequing':
    default:
      return (<svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 9h10M7 13h6" /></svg>)
  }
}

export function AccountRow({
  account,
  members,
}: {
  account: Account
  members: { id: string; name: string }[]
}) {
  const [editing, setEditing] = useState(false)
  const [ownership, setOwnership] = useState<'member' | 'shared'>(account.ownership as never)

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
              <select
                name="ownership"
                value={ownership}
                onChange={(e) => setOwnership(e.target.value as 'member' | 'shared')}
                className="maple-select sm"
              >
                {ACCOUNT_OWNERSHIP.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </EditField>
            <EditField label="Member">
              <select
                name="member_id"
                disabled={ownership === 'shared'}
                defaultValue={account.member_id ?? ''}
                className="maple-select sm disabled:bg-paper-2 disabled:text-ink-3"
              >
                {ownership === 'shared' ? (
                  <option value="">— Shared —</option>
                ) : (
                  members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </select>
            </EditField>
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
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full ' +
            (isLiability ? 'bg-maple-soft text-maple' : 'bg-leaf-soft text-leaf')
          }
        >
          <AccountIcon type={account.type} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[16px] tracking-[-0.01em] text-ink">
            {account.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-ink-3">
            <span>{account.typeLabel}</span>
            <span>·</span>
            <span>
              {account.ownership === 'shared' ? 'Shared' : (account.memberName ?? 'Member removed')}
            </span>
            {account.last_four && (
              <>
                <span>·</span>
                <span className="tabular-nums">····{account.last_four}</span>
              </>
            )}
          </div>
        </div>
        <div className="text-right">
          <Amount
            cents={isLiability ? -Math.abs(account.opening_balance_cents) : account.opening_balance_cents}
            sign={isLiability ? 'auto' : 'none'}
            tone={isLiability ? 'maple' : 'ink'}
            className="text-[16px]"
          />
          <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-ink-3">
            Opening
          </div>
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
