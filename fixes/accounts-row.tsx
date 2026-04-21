'use client'

import { useState } from 'react'
import { formatMoney } from '@/lib/format'
import { ACCOUNT_TYPES, ACCOUNT_OWNERSHIP } from '@/lib/domain'
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
  archived: boolean
}

/** Small icon glyph per account type — drawn SVG so it inherits the palette. */
function AccountIcon({ type }: { type: string }) {
  const common = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'credit_card':
      return (<svg {...common}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>)
    case 'savings':
    case 'registered':
      return (<svg {...common}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H7" /></svg>)
    case 'loan':
      return (<svg {...common}><path d="M3 12h18M3 6h18M3 18h12" /></svg>)
    case 'crypto':
      return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9 8h5a2.5 2.5 0 0 1 0 5H9M9 13h5.5a2.5 2.5 0 0 1 0 5H9M10 6v12M14 6v12" /></svg>)
    case 'cash':
      return (<svg {...common}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="3" /></svg>)
    default: // chequing + fallback
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
      <li className="border-b border-[var(--color-hair)] bg-[var(--color-cream-2)]/60 px-5 py-4 last:border-b-0">
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
                className="maple-select sm disabled:bg-[var(--color-paper-2)] disabled:text-[var(--color-ink-3)]"
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
            <EditField label="Opening balance" span={2}>
              <div className="flex items-center rounded-[10px] border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1.5 transition-colors focus-within:border-[var(--color-leaf)]">
                <span className="text-[12px] text-[var(--color-ink-3)]">$</span>
                <input
                  name="opening_balance"
                  type="text"
                  inputMode="decimal"
                  defaultValue={(account.opening_balance_cents / 100).toFixed(2)}
                  className="w-full bg-transparent pl-1 text-[13px] tabular-nums text-[var(--color-ink)] outline-none"
                />
              </div>
            </EditField>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              className="inline-flex items-center rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12.5px] font-semibold text-[var(--color-paper)]"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-[12.5px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)]"
            >
              Cancel
            </button>
          </div>
        </form>
      </li>
    )
  }

  // ───── DISPLAY ─────
  const isLiability = account.type === 'credit_card' || account.type === 'loan'
  const amountColor = isLiability ? 'var(--color-maple)' : 'var(--color-ink)'
  const amountPrefix = isLiability && account.opening_balance_cents !== 0 ? '−' : ''

  return (
    <li
      className={
        'group flex items-center justify-between gap-4 border-b border-[var(--color-hair)] px-5 py-3.5 transition-colors last:border-b-0 ' +
        (account.archived ? 'opacity-50' : 'hover:bg-[var(--color-cream-2)]/40')
      }
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{
            background: isLiability ? 'var(--color-maple-soft)' : 'var(--color-leaf-soft)',
            color: isLiability ? 'var(--color-maple)' : 'var(--color-leaf)',
          }}
        >
          <AccountIcon type={account.type} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[16px] tracking-[-0.01em] text-[var(--color-ink)]">
            {account.name}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-[var(--color-ink-3)]">
            <span>{account.typeLabel}</span>
            <span>·</span>
            <span>
              {account.ownership === 'shared' ? 'Shared' : (account.memberName ?? 'Member removed')}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div
            className="font-serif text-[16px] tabular-nums tracking-[-0.01em]"
            style={{ color: amountColor }}
          >
            {amountPrefix}
            {formatMoney(Math.abs(account.opening_balance_cents))}
          </div>
          <div className="text-[10.5px] font-medium uppercase tracking-[0.06em] text-[var(--color-ink-3)]">
            Opening
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 text-[12px] opacity-60 transition-opacity group-hover:opacity-100">
        {!account.archived && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
          >
            Edit
          </button>
        )}
        {account.archived ? (
          <form action={unarchiveAccount}>
            <input type="hidden" name="id" value={account.id} />
            <button type="submit" className="font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline">
              Unarchive
            </button>
          </form>
        ) : (
          <form action={archiveAccount}>
            <input type="hidden" name="id" value={account.id} />
            <button
              type="submit"
              className="font-semibold hover:underline"
              style={{ color: 'var(--color-maple)' }}
            >
              Archive
            </button>
          </form>
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
      <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  )
}
