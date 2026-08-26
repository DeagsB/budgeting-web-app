'use client'

import { useEffect, useState, useTransition, type ReactNode } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Chip } from '@/components/ui/chip'
import { Sheet } from '@/components/ui/sheet'
import { useQuickAddTarget } from '@/lib/quick-add'
import { FilterSheet, FilterSection, FilterRadioRow } from '@/components/ui/filter-sheet'
import { SegmentedControl } from '@/components/ui/segmented-control'
import { MapleLabel } from '@/components/ui/label'
import { AddTransactionForm } from './add-form'
import { monthStartISO } from '@/lib/format'

type Account = { id: string; name: string }
type Category = { id: string; parent_id: string | null; name: string }
type Member = { id: string; name: string }

type Draft = { member: string; account: string; category: string }

/**
 * Transactions controls. Filters are URL-driven so the server component reads
 * them from `searchParams`; only the sheets need local state.
 *
 * Mobile (<md): search + a "Filter" pill (opens a FilterSheet with member /
 * account / category) + a "..." overflow for secondary actions; active filters
 * render as removable chips under the search; the add form opens from the tab
 * bar's centre "+" (or `?add=1`, which the "+" uses when arriving from another
 * screen).
 * Desktop (md+): the inline chip rail + category select + "Add transaction".
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
  defaultMemberId = null,
  overflowActions,
}: {
  month: string
  search: string
  accountId?: string
  categoryId?: string
  memberId?: string
  accounts: Account[]
  categories: Category[]
  members: Member[]
  /** The signed-in member, preselected as payer in the add form. */
  defaultMemberId?: string | null
  /** Secondary actions (sync, import) shown in the mobile "..." sheet. */
  overflowActions?: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startNav] = useTransition()
  const searchParams = useSearchParams()
  const [addOpen, setAddOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const canAdd = accounts.length > 0

  // The tab bar's centre "+" opens the add sheet in place while this screen
  // is mounted; from elsewhere it lands here with `?add=1`.
  useQuickAddTarget(canAdd ? () => setAddOpen(true) : null)
  const addParam = searchParams.get('add')
  useEffect(() => {
    if (addParam !== '1') return
    if (canAdd) setAddOpen(true) // eslint-disable-line react-hooks/set-state-in-effect
    // Strip the one-shot flag so a refresh / back doesn't reopen the sheet.
    const params = new URLSearchParams(searchParams.toString())
    params.delete('add')
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addParam])
  const [draft, setDraft] = useState<Draft>({ member: '', account: '', category: '' })
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

  function clearAll() {
    setSearchValue('')
    navigate({ search: '', account: '', category: '', member: '' })
  }

  function openFilters() {
    setDraft({ member: memberId ?? '', account: accountId ?? '', category: categoryId ?? '' })
    setFilterOpen(true)
  }

  function applyFilters() {
    navigate({ member: draft.member, account: draft.account, category: draft.category })
    setFilterOpen(false)
  }

  const hasFilter = !!(searchValue.trim() || accountId || categoryId || memberId)

  // Active (non-search) filters as removable chips - mobile only; desktop shows
  // the full rail where the active chip is already highlighted.
  const memberLabel =
    memberId === 'shared' ? 'Shared' : members.find((m) => m.id === memberId)?.name
  const accountLabel = accounts.find((a) => a.id === accountId)?.name
  const categoryLabel = categories.find((c) => c.id === categoryId)?.name
  const activeChips: { key: 'member' | 'account' | 'category'; label: string }[] = []
  if (memberId && memberLabel) activeChips.push({ key: 'member', label: memberLabel })
  if (accountId && accountLabel) activeChips.push({ key: 'account', label: accountLabel })
  if (categoryId && categoryLabel) activeChips.push({ key: 'category', label: categoryLabel })
  const filterCount = activeChips.length

  const memberOptions = [
    { value: '', label: 'All' },
    { value: 'shared', label: 'Shared' },
    ...members.map((m) => ({ value: m.id, label: m.name })),
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Search + (mobile) Filter / overflow + (desktop) Add */}
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-[420px]">
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
            placeholder="Search…"
            aria-label="Search transactions"
            // `.maple-input` is unlayered CSS and sets `padding` shorthand, which
            // beats Tailwind's layered `pl-10` - so the left padding must be set
            // inline to clear the search icon. (Right pad makes room for the
            // native search-clear affordance.)
            className="maple-input"
            style={{ paddingLeft: '2.5rem', paddingRight: '1rem' }}
          />
        </div>

        {/* Mobile: Filter pill with a count badge when anything is set. */}
        <button
          type="button"
          onClick={openFilters}
          aria-haspopup="dialog"
          aria-expanded={filterOpen}
          aria-label={filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'}
          className={
            'inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold transition-colors md:hidden ' +
            (filterCount > 0
              ? 'border-leaf bg-leaf-soft text-leaf-deep'
              : 'border-hair bg-paper text-ink')
          }
        >
          <FilterIcon />
          Filter
          {filterCount > 0 && (
            <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-leaf px-1.5 text-[11px] font-bold tabular-nums text-paper">
              {filterCount}
            </span>
          )}
        </button>

        {overflowActions ? <OverflowMenu>{overflowActions}</OverflowMenu> : null}

        {/* Wrapper carries the breakpoint: Button's own `inline-flex` would
            otherwise beat a `hidden` passed via className. */}
        <div className="hidden shrink-0 md:block">
          <Button
            variant="primary"
            size="md"
            onClick={() => setAddOpen(true)}
            disabled={accounts.length === 0}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add transaction
          </Button>
        </div>
      </div>

      {/* Mobile: active filters as removable chips (44px hit area, smaller pill). */}
      {activeChips.length > 0 && (
        <div className="hide-scroll -m-1 flex items-center gap-0.5 overflow-x-auto overflow-y-hidden p-1 md:hidden">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => navigate({ [c.key]: '' })}
              aria-label={`Remove ${c.label} filter`}
              className="flex min-h-[44px] shrink-0 items-center px-0.5"
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-leaf px-2.5 py-1 text-[12px] font-semibold text-paper">
                {c.label}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 flex min-h-[44px] shrink-0 items-center px-1 text-[12px] font-semibold text-ink-2"
          >
            Clear
          </button>
        </div>
      )}

      {/* Desktop: chip filter rail (scrollbar hidden). */}
      <div className="hide-scroll -mx-1 hidden items-center gap-2 overflow-x-auto overflow-y-hidden px-1 pb-1 md:flex">
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

      {/* Desktop: category select + clear - category list is hierarchical and
          long, so a select reads better than a chip-per-category row. */}
      {categories.length > 0 && (
        <div className="hidden flex-row items-end gap-3 md:flex">
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
            <Button variant="ghost" size="sm" onClick={clearAll} className="self-end">
              Clear filters
            </Button>
          )}
        </div>
      )}

      <FilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        onApply={applyFilters}
        onClear={() => {
          setFilterOpen(false)
          navigate({ account: '', category: '', member: '' })
        }}
      >
        <FilterSection label="Member">
          <div className="hide-scroll -mx-1 overflow-x-auto overflow-y-hidden px-1 py-0.5">
            <SegmentedControl
              ariaLabel="Filter by member"
              className="whitespace-nowrap"
              options={memberOptions}
              value={draft.member}
              onChange={(v) => setDraft((d) => ({ ...d, member: v }))}
            />
          </div>
        </FilterSection>

        <FilterSection label="Account">
          <div className="-mx-1 flex flex-col">
            <FilterRadioRow
              name="account"
              value=""
              checked={draft.account === ''}
              onSelect={() => setDraft((d) => ({ ...d, account: '' }))}
            >
              All accounts
            </FilterRadioRow>
            {accounts.map((a) => (
              <FilterRadioRow
                key={a.id}
                name="account"
                value={a.id}
                checked={draft.account === a.id}
                onSelect={(v) => setDraft((d) => ({ ...d, account: v }))}
              >
                {a.name}
              </FilterRadioRow>
            ))}
          </div>
        </FilterSection>

        {categories.length > 0 && (
          <FilterSection label="Category">
            <select
              value={draft.category}
              onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
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
          </FilterSection>
        )}
      </FilterSheet>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Add transaction">
        <AddTransactionForm
          defaultDate={monthStartISO()}
          accounts={accounts}
          categories={categories}
          members={members}
          defaultMemberId={defaultMemberId}
          onSaved={() => setAddOpen(false)}
        />
      </Sheet>
    </div>
  )
}

/**
 * Mobile "..." button that opens a sheet of secondary actions. Children are
 * rendered one per 44px row. Hidden on md+ where the actions sit inline in the
 * page header.
 */
function OverflowMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="More actions"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hair bg-paper text-ink-2 md:hidden"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="6" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18" cy="12" r="1.7" />
        </svg>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="More">
        <div className="flex flex-col gap-1 pb-2" onClick={() => setOpen(false)}>
          {children}
        </div>
      </Sheet>
    </>
  )
}

function FilterIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  )
}
