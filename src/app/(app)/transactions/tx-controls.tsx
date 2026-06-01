'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Sheet } from '@/components/ui/sheet'
import { MapleLabel } from '@/components/ui/label'
import { AddTransactionForm } from './add-form'
import { monthStartISO } from '@/lib/format'

type Account = { id: string; name: string }
type Category = { id: string; parent_id: string | null; name: string }
type Member = { id: string; name: string }

/**
 * Always-visible transactions controls: a live search box, a horizontal Chip
 * filter row (account / member, plus a category select for the long
 * hierarchical list), and an "Add transaction" primary button that opens the
 * add form in a bottom Sheet. Filters are URL-driven so the server component
 * can read them from `searchParams`; only the add-form Sheet needs local state.
 */
export function TxControls({
  month,
  search,
  accountId,
  categoryId,
  memberId,
  accounts,
  categories,
  members,
}: {
  month: string
  search: string
  accountId?: string
  categoryId?: string
  memberId?: string
  accounts: Account[]
  categories: Category[]
  members: Member[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startNav] = useTransition()
  const [addOpen, setAddOpen] = useState(false)
  const [searchValue, setSearchValue] = useState(search)

  // Keep the local input in sync if the URL search param changes elsewhere
  // (e.g. month navigation preserves it, "Clear" resets it).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchValue(search)
  }, [search])

  // Push the current filter set into the URL. Omitted/empty values drop their
  // query key so the URL stays clean and the server treats them as "all".
  function navigate(next: {
    search?: string
    account?: string
    category?: string
    member?: string
  }) {
    const params = new URLSearchParams()
    params.set('month', month)
    const q = next.search ?? searchValue
    const acc = next.account ?? accountId
    const cat = next.category ?? categoryId
    const mem = next.member ?? memberId
    if (q && q.trim()) params.set('q', q.trim())
    if (acc) params.set('account', acc)
    if (cat) params.set('category', cat)
    if (mem) params.set('member', mem)
    startNav(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  function toggle(key: 'account' | 'member', value: string) {
    const current = key === 'account' ? accountId : memberId
    navigate({ [key]: current === value ? '' : value })
  }

  const hasFilter = !!(searchValue.trim() || accountId || categoryId || memberId)

  return (
    <div className="flex flex-col gap-3">
      {/* Search + add row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 sm:max-w-[420px]">
          <span
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
          </span>
          <input
            type="search"
            inputMode="search"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate({ search: searchValue })
            }}
            onBlur={() => navigate({ search: searchValue })}
            placeholder="Search descriptions…"
            aria-label="Search transactions"
            // `.maple-input` is unlayered CSS and sets `padding` shorthand, which
            // beats Tailwind's layered `pl-10` — so the left padding must be set
            // inline to clear the search icon. (Right pad makes room for the
            // native search-clear affordance.)
            className="maple-input"
            style={{ paddingLeft: '2.5rem', paddingRight: '1rem' }}
          />
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={() => setAddOpen(true)}
          className="w-full shrink-0 sm:w-auto"
          disabled={accounts.length === 0}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add transaction
        </Button>
      </div>

      {/* Chip filter row — always visible, horizontally scrollable on mobile */}
      <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
        <Chip active={memberId === 'shared'} onClick={() => toggle('member', 'shared')} className="shrink-0">
          Shared
        </Chip>
        {members.map((m) => (
          <Chip
            key={m.id}
            active={memberId === m.id}
            onClick={() => toggle('member', m.id)}
            className="shrink-0"
          >
            {m.name}
          </Chip>
        ))}
        {accounts.length > 0 && <span className="mx-0.5 h-5 w-px shrink-0 bg-hair" aria-hidden />}
        {accounts.map((a) => (
          <Chip
            key={a.id}
            active={accountId === a.id}
            onClick={() => toggle('account', a.id)}
            className="shrink-0"
          >
            {a.name}
          </Chip>
        ))}
      </div>

      {/* Category select + clear — category list is hierarchical and long, so a
          select reads better than a chip-per-category row. */}
      {categories.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1 sm:max-w-[280px]">
            <MapleLabel>Category</MapleLabel>
            <select
              value={categoryId ?? ''}
              onChange={(e) => navigate({ category: e.target.value })}
              aria-label="Filter by category"
              className="maple-select"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent_id ? `↳ ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </label>
          {hasFilter && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchValue('')
                navigate({ search: '', account: '', category: '', member: '' })
              }}
              className="self-start sm:self-end"
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add transaction">
        <AddTransactionForm
          defaultDate={monthStartISO()}
          accounts={accounts}
          categories={categories}
          members={members}
          onSaved={() => setAddOpen(false)}
        />
      </Sheet>
    </div>
  )
}
