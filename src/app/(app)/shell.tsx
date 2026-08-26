'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { signOut } from '../(auth)/actions'
import { Button } from '@/components/ui/button'
import { PullToSync } from '@/components/pull-to-sync'
import { useScrollLock } from '@/lib/use-scroll-lock'

/**
 * Maple shell. Light + dark are driven by the `.dark` class on <html>
 * (bootstrap lives in src/app/layout.tsx).
 *
 * Layout:
 *   - Desktop (md+): fixed left sidebar (240px) with household + nav + user.
 *   - Mobile (<md): top bar (wordmark + household), main content, fixed
 *     bottom tab bar with up to 4 user-customizable destinations + More.
 *     Tab bar config persists in localStorage so the user's choices stick
 *     across sessions on the same device.
 */

// ─── Destination registry ────────────────────────────────────────────────
// Single source of truth for every navigable destination + the icon it
// uses on the bottom tab bar. Anything in here can be promoted to the
// tab bar; anything not on the tab bar shows up in the More sheet.

const DESTS = [
  // Spending — daily drivers (rendered unlabeled at the top of the sidebar).
  { href: '/dashboard',      label: 'Home',          tabLabel: 'Home',         icon: HomeIcon,        group: 'main'    },
  { href: '/transactions',   label: 'Transactions',  tabLabel: 'Transactions', icon: ActivityIcon,    group: 'main'    },
  { href: '/budgets',        label: 'Budgets',       tabLabel: 'Budgets',      icon: BudgetsIcon,     group: 'main'    },
  { href: '/accounts',       label: 'Accounts',      tabLabel: 'Accounts',     icon: AccountsIcon,    group: 'main'    },
  // Split & settle — shared-money tasks.
  { href: '/shared',         label: 'Shared expenses', tabLabel: 'Shared',     icon: SharedIcon,      group: 'split'   },
  { href: '/settlements',    label: 'Settle up',     tabLabel: 'Settle',       icon: SettlementsIcon, group: 'split'   },
  { href: '/rules',          label: 'Rules',         tabLabel: 'Rules',        icon: RulesIcon,       group: 'split'   },
  // Reports — read-only financial statements.
  { href: '/pnl',            label: 'Profit & Loss', tabLabel: 'P&L',          icon: ChartIcon,       group: 'reports' },
  { href: '/balance-sheet',  label: 'Balance sheet', tabLabel: 'Balance',      icon: ScaleIcon,       group: 'reports' },
  { href: '/net-worth',      label: 'Net worth',     tabLabel: 'Net worth',    icon: TrendIcon,       group: 'reports' },
  // Plans & savings — forward-looking trackers.
  { href: '/goals',          label: 'Goals',         tabLabel: 'Goals',        icon: TargetIcon,      group: 'plans'   },
  { href: '/contributions',  label: 'Contributions', tabLabel: 'Contribs',     icon: PiggyIcon,       group: 'plans'   },
  { href: '/loans',          label: 'Loans',         tabLabel: 'Loans',        icon: LoanIcon,        group: 'plans'   },
  { href: '/time-off',       label: 'Time off',      tabLabel: 'Time off',     icon: PlaneIcon,       group: 'plans'   },
  // Setup — household name, members, categories.
  { href: '/setup',          label: 'Setup',         tabLabel: 'Setup',        icon: SettingsIcon,    group: 'setup'   },
] as const

type Dest = (typeof DESTS)[number]

const DEFAULT_TABS = ['/dashboard', '/transactions', '/budgets']
const TAB_STORAGE_KEY = 'maple.tabBar.v1'
const MAX_TABS = 4

function findDest(href: string): Dest | undefined {
  return DESTS.find((d) => d.href === href)
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
}

// Selector for elements that can hold focus inside an open overlay.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Hardens a custom overlay: Esc closes, focus is trapped within the panel
 * while open, and focus is restored to the previously-active element on
 * close. Mirrors the behaviour of the shared <Sheet> primitive without
 * rebuilding the overlay on top of it.
 */
function useOverlay(open: boolean, panelRef: React.RefObject<HTMLDivElement | null>, onClose: () => void) {
  const restoreFocusRef = useRef<Element | null>(null)

  // Lock background scroll while the overlay is open (iOS-safe).
  useScrollLock(open)

  // Save the trigger, move focus into the panel on open, restore on close.
  useEffect(() => {
    if (!open) return
    restoreFocusRef.current = document.activeElement
    panelRef.current?.focus()
    return () => {
      const el = restoreFocusRef.current
      if (el instanceof HTMLElement) el.focus()
      restoreFocusRef.current = null
    }
  }, [open, panelRef])

  // Esc closes; Tab is trapped within the panel.
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === panel,
      )
      if (focusable.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement
      if (e.shiftKey) {
        if (active === first || active === panel) {
          e.preventDefault()
          last.focus()
        }
      } else if (active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, panelRef])
}

function loadTabs(): string[] {
  if (typeof window === 'undefined') return DEFAULT_TABS
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY)
    if (!raw) return DEFAULT_TABS
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_TABS
    const valid = parsed.filter((h): h is string => typeof h === 'string' && !!findDest(h))
    if (valid.length === 0) return DEFAULT_TABS
    return valid.slice(0, MAX_TABS)
  } catch {
    return DEFAULT_TABS
  }
}

export function AppShell({
  householdName,
  userEmail,
  memberName = null,
  children,
}: {
  householdName: string
  userEmail: string
  memberName?: string | null
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  // ─── Single-tap bottom-nav during momentum scroll ───
  // iOS Safari consumes the first tap that lands while the page is still
  // inertially scrolling to stop the scroll — it never becomes a `click`, so a
  // fixed tab bar feels like it needs two taps. `pointerup` *does* fire on that
  // tap, so we resolve a tap there and navigate immediately, then suppress the
  // duplicate click that follows on a normal (non-scrolling) tap.
  const tapStart = useRef<{ x: number; y: number } | null>(null)
  const lastTapNavAt = useRef(0)
  // `nativeClick: true` for <Link> (let the browser handle a real mouse click /
  // open-in-new-tab); false for a plain <button> where onClick must run the
  // action itself.
  function tabTap(action: () => void, opts?: { nativeClick?: boolean }) {
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === 'touch') tapStart.current = { x: e.clientX, y: e.clientY }
      },
      onPointerUp: (e: React.PointerEvent) => {
        if (e.pointerType !== 'touch') return
        const start = tapStart.current
        tapStart.current = null
        // Ignore a swipe/scroll gesture that merely began on the bar.
        if (!start || Math.abs(e.clientX - start.x) > 12 || Math.abs(e.clientY - start.y) > 12) return
        lastTapNavAt.current = Date.now()
        action()
      },
      onClick: (e: React.MouseEvent) => {
        // Touch already navigated on pointerup → drop the synthesized click.
        if (Date.now() - lastTapNavAt.current < 700) {
          if (opts?.nativeClick) e.preventDefault()
          return
        }
        // Genuine mouse / keyboard click on a non-link target.
        if (!opts?.nativeClick) action()
      },
    }
  }
  // Hydrate-safe: render the default order on SSR + first paint, then swap
  // to the persisted choice once we can read localStorage. Avoids hydration
  // mismatch warnings.
  const [tabHrefs, setTabHrefs] = useState<string[]>(DEFAULT_TABS)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTabHrefs(loadTabs())
  }, [])

  function saveTabs(next: string[]) {
    setTabHrefs(next)
    try { localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  const closeMore = () => setMoreOpen(false)
  const closeEdit = () => setEditOpen(false)

  const morePanelRef = useRef<HTMLDivElement>(null)
  useOverlay(moreOpen, morePanelRef, closeMore)

  const tabs = useMemo(
    () =>
      tabHrefs
        .map((h) => findDest(h))
        .filter((d): d is Dest => !!d)
        .slice(0, MAX_TABS),
    [tabHrefs],
  )
  // Anything not on the tab bar drops into the More sheet, grouped.
  const moreItems = useMemo(() => {
    const onBar = new Set(tabHrefs)
    return {
      main: DESTS.filter((d) => d.group === 'main' && !onBar.has(d.href)),
      split: DESTS.filter((d) => d.group === 'split' && !onBar.has(d.href)),
      reports: DESTS.filter((d) => d.group === 'reports' && !onBar.has(d.href)),
      plans: DESTS.filter((d) => d.group === 'plans' && !onBar.has(d.href)),
      setup: DESTS.filter((d) => d.group === 'setup' && !onBar.has(d.href)),
    }
  }, [tabHrefs])

  // Tag <body> on mount so the global CSS rule that adjusts page padding for
  // the bottom tab bar can fire.
  useEffect(() => {
    const cls = 'has-tabbar'
    document.body.classList.add(cls)
    return () => document.body.classList.remove(cls)
  }, [])

  return (
    <div className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      {/* ───────── Desktop sidebar ───────── */}
      <aside className="maple-chrome fixed inset-y-0 left-0 z-20 hidden w-[240px] flex-col border-r border-[var(--color-hair)] bg-[var(--color-cream-2)] px-5 py-6 md:flex">
        <Link href="/dashboard" className="block">
          <div className="font-serif text-[26px] leading-none tracking-[-0.02em] text-[var(--color-ink)]">
            Maple
          </div>
          <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            {householdName}
          </div>
        </Link>

        <nav className="mt-8 flex flex-1 flex-col gap-6 overflow-y-auto">
          <NavGroup
            items={DESTS.filter((d) => d.group === 'main').map((d) => ({ href: d.href, label: d.label }))}
            pathname={pathname}
            onNav={closeMore}
          />
          <NavGroup
            label="Split & settle"
            items={DESTS.filter((d) => d.group === 'split').map((d) => ({ href: d.href, label: d.label }))}
            pathname={pathname}
            onNav={closeMore}
          />
          <NavGroup
            label="Reports"
            items={DESTS.filter((d) => d.group === 'reports').map((d) => ({ href: d.href, label: d.label }))}
            pathname={pathname}
            onNav={closeMore}
          />
          <NavGroup
            label="Plans & savings"
            items={DESTS.filter((d) => d.group === 'plans').map((d) => ({ href: d.href, label: d.label }))}
            pathname={pathname}
            onNav={closeMore}
          />
          <NavGroup
            label="Setup"
            items={DESTS.filter((d) => d.group === 'setup').map((d) => ({ href: d.href, label: d.label }))}
            pathname={pathname}
            onNav={closeMore}
          />
        </nav>

        <div className="mt-4 border-t border-[var(--color-hair)] pt-4">
          {memberName && (
            <div className="truncate font-serif text-[15px] text-[var(--color-ink)]">{memberName}</div>
          )}
          <div className="truncate text-[12px] text-[var(--color-ink-2)]">{userEmail}</div>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="text-[12px] font-semibold text-[var(--color-ink-2)] underline-offset-2 transition-colors hover:text-[var(--color-ink)] hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* ───────── Mobile top bar ───────── */}
      <header className="maple-chrome sticky top-0 z-20 border-b border-[var(--color-hair)] bg-[var(--color-cream)]/85 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)]">
          <Link href="/dashboard" className="min-w-0">
            <div className="font-serif text-[22px] leading-none tracking-[-0.02em]">Maple</div>
            <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
              {householdName}
            </div>
          </Link>
          <Link
            href="/setup"
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] text-[var(--color-ink-2)]"
          >
            <SettingsIcon />
          </Link>
        </div>
      </header>

      {/* ───────── Main content ───────── */}
      <main className="md:pl-[240px]">
        <div
          className="mx-auto max-w-[720px] px-4 py-5 md:max-w-[1080px] md:px-10 md:py-10"
          style={{ paddingBottom: 'calc(72px + env(safe-area-inset-bottom) + 16px)' }}
        >
          {/* Pull-to-sync wraps every screen so the gesture is universal — a
              pull-down at the top of any page triggers a Gmail sync + refresh. */}
          <PullToSync>{children}</PullToSync>
        </div>
      </main>

      {/* ───────── Mobile bottom tab bar ───────── */}
      <nav
        aria-label="Primary"
        className="maple-chrome fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-hair)] bg-[var(--color-cream)]/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-[520px] items-stretch justify-around px-1">
          {tabs.map((d) => {
            const active = isActive(pathname, d.href)
            const Icon = d.icon
            return (
              <li key={d.href} className="flex-1">
                <Link
                  href={d.href}
                  className={tabClass(active)}
                  aria-current={active ? 'page' : undefined}
                  {...tabTap(() => router.push(d.href), { nativeClick: true })}
                >
                  <Icon active={active} />
                  <span className="mt-0.5 text-[10.5px] font-semibold tracking-[-0.01em]">
                    {d.tabLabel}
                  </span>
                </Link>
              </li>
            )
          })}
          {(() => {
            const moreActive =
              !tabs.some((d) => isActive(pathname, d.href)) && pathname !== '/'
            return (
              <li key="more" className="flex-1">
                <button
                  type="button"
                  {...tabTap(() => setMoreOpen(true))}
                  aria-haspopup="dialog"
                  aria-expanded={moreOpen}
                  className={tabClass(moreActive)}
                >
                  <MoreIcon active={moreActive} />
                  <span className="mt-0.5 text-[10.5px] font-semibold tracking-[-0.01em]">More</span>
                </button>
              </li>
            )
          })()}
        </ul>
      </nav>

      {/* ───────── More sheet ───────── */}
      {moreOpen && (
        <>
          <button
            type="button"
            aria-hidden="true"
            onClick={closeMore}
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
          />
          <div
            ref={morePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[86vh] overflow-y-auto rounded-t-xl border-t border-[var(--color-hair)] bg-[var(--color-cream)] shadow-[var(--shadow-float)] outline-none md:hidden"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            <div className="flex justify-center pb-1 pt-2">
              <div className="h-1 w-10 rounded-full bg-[var(--color-hair)]" aria-hidden />
            </div>
            <div className="px-5 pb-2 pt-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-serif text-[20px] tracking-[-0.02em]">More</div>
                  <div className="truncate text-[11.5px] text-[var(--color-ink-2)]">
                    {memberName ? `${memberName} · ` : ''}
                    {userEmail}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeMore}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)]"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <div className="px-3 pb-3">
              {moreItems.main.length > 0 && (
                <SheetGroup
                  label="Spending"
                  items={moreItems.main.map((d) => ({ href: d.href, label: d.label }))}
                  pathname={pathname}
                  onNav={closeMore}
                />
              )}
              {moreItems.split.length > 0 && (
                <SheetGroup
                  label="Split & settle"
                  items={moreItems.split.map((d) => ({ href: d.href, label: d.label }))}
                  pathname={pathname}
                  onNav={closeMore}
                />
              )}
              {moreItems.reports.length > 0 && (
                <SheetGroup
                  label="Reports"
                  items={moreItems.reports.map((d) => ({ href: d.href, label: d.label }))}
                  pathname={pathname}
                  onNav={closeMore}
                />
              )}
              {moreItems.plans.length > 0 && (
                <SheetGroup
                  label="Plans & savings"
                  items={moreItems.plans.map((d) => ({ href: d.href, label: d.label }))}
                  pathname={pathname}
                  onNav={closeMore}
                />
              )}
              {moreItems.setup.length > 0 && (
                <SheetGroup
                  label="Setup"
                  items={moreItems.setup.map((d) => ({ href: d.href, label: d.label }))}
                  pathname={pathname}
                  onNav={closeMore}
                />
              )}
              <div className="mt-4 border-t border-[var(--color-hair)] pt-3">
                <div className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.10em] text-[var(--color-ink-3)]">
                  Customize
                </div>
                <button
                  type="button"
                  onClick={() => { closeMore(); setEditOpen(true) }}
                  className="flex w-full items-center gap-3 rounded-[12px] px-3 py-3 text-[15px] font-medium text-[var(--color-ink)] transition-colors hover:bg-[var(--color-paper-2)]"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf-deep)' }}
                  >
                    <GridIcon />
                  </span>
                  <span className="flex-1 text-left">
                    <span className="block">Customize tabs</span>
                    <span className="block text-[11.5px] font-normal text-[var(--color-ink-3)]">
                      Pick which destinations live on the bottom bar
                    </span>
                  </span>
                  <span className="text-[18px] text-[var(--color-ink-3)]">›</span>
                </button>
                <form action={signOut} className="mt-2 px-3 pt-2">
                  <button type="submit" className="text-[14px] font-semibold text-[var(--color-ink-2)]">
                    Sign out
                  </button>
                </form>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ───────── Tab editor sheet ───────── */}
      {editOpen && (
        <TabBarEditor
          current={tabHrefs}
          onCancel={closeEdit}
          onSave={(next) => {
            saveTabs(next)
            closeEdit()
          }}
        />
      )}
    </div>
  )
}

// ─── Tab bar editor ───────────────────────────────────────────────────────

function TabBarEditor({
  current,
  onCancel,
  onSave,
}: {
  current: string[]
  onCancel: () => void
  onSave: (next: string[]) => void
}) {
  const [draft, setDraft] = useState<string[]>(current)
  // This editor is mounted only while open, so the overlay is always "open"
  // for the lifetime of the component.
  const panelRef = useRef<HTMLDivElement>(null)
  useOverlay(true, panelRef, onCancel)

  function move(href: string, dir: -1 | 1) {
    setDraft((prev) => {
      const i = prev.indexOf(href)
      if (i < 0) return prev
      const j = i + dir
      if (j < 0 || j >= prev.length) return prev
      const next = prev.slice()
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }
  function remove(href: string) {
    setDraft((prev) => prev.filter((h) => h !== href))
  }
  function add(href: string) {
    setDraft((prev) => (prev.length >= MAX_TABS || prev.includes(href) ? prev : [...prev, href]))
  }

  const onBar = draft
    .map((h) => findDest(h))
    .filter((d): d is Dest => !!d)
  const offBar = DESTS.filter((d) => !draft.includes(d.href))
  const full = draft.length >= MAX_TABS

  return (
    <>
      <button
        type="button"
        aria-hidden="true"
        onClick={onCancel}
        className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Customize tab bar"
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-[60] flex max-h-[88vh] flex-col rounded-t-xl border-t border-[var(--color-hair)] bg-[var(--color-cream)] shadow-[var(--shadow-float)] outline-none sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:max-h-[80vh] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
      >
        <div className="flex justify-center pb-1 pt-2 sm:hidden">
          <div className="h-1 w-10 rounded-full bg-[var(--color-hair)]" aria-hidden />
        </div>
        <header className="flex items-baseline justify-between border-b border-[var(--color-hair)] px-5 py-3.5 sm:py-5">
          <div>
            <div className="font-serif text-[20px] tracking-[-0.02em] text-[var(--color-ink)]">
              Customize tabs
            </div>
            <div className="mt-0.5 text-[12px] text-[var(--color-ink-2)]">
              Pick up to {MAX_TABS}. The 5th slot is always “More”.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)]"
          >
            <CloseIcon />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.10em] text-[var(--color-ink-3)]">
            On the tab bar ({onBar.length} of {MAX_TABS})
          </div>
          <ul className="flex flex-col gap-1.5">
            {onBar.length === 0 && (
              <li className="rounded-[12px] border border-dashed border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-3 text-center text-[12.5px] text-[var(--color-ink-2)]">
                Add a destination below to put it on the tab bar.
              </li>
            )}
            {onBar.map((d, i) => (
              <li
                key={d.href}
                className="flex items-center gap-2 rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-2.5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper-2)] text-[var(--color-ink-2)]">
                  <d.icon active />
                </span>
                <span className="flex-1 truncate text-[14px] font-medium text-[var(--color-ink)]">
                  {d.label}
                </span>
                <button
                  type="button"
                  onClick={() => move(d.href, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${d.label} up`}
                  className="flex h-11 w-11 -mr-1.5 items-center justify-center rounded-full text-[var(--color-ink-2)] disabled:opacity-30"
                >
                  <ArrowUpIcon />
                </button>
                <button
                  type="button"
                  onClick={() => move(d.href, 1)}
                  disabled={i === onBar.length - 1}
                  aria-label={`Move ${d.label} down`}
                  className="flex h-11 w-11 -mr-1.5 items-center justify-center rounded-full text-[var(--color-ink-2)] disabled:opacity-30"
                >
                  <ArrowDownIcon />
                </button>
                <button
                  type="button"
                  onClick={() => remove(d.href)}
                  aria-label={`Remove ${d.label} from tab bar`}
                  className="flex h-11 w-11 -mr-1.5 items-center justify-center rounded-full text-[var(--color-maple)]"
                >
                  <CloseIcon />
                </button>
              </li>
            ))}
          </ul>

          {offBar.length > 0 && (
            <>
              <div className="mt-4 px-2 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.10em] text-[var(--color-ink-3)]">
                Available destinations
              </div>
              <ul className="flex flex-col gap-1.5">
                {offBar.map((d) => (
                  <li
                    key={d.href}
                    className="flex items-center gap-2 rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-paper-2)] px-3 py-2.5"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper)] text-[var(--color-ink-3)]">
                      <d.icon active={false} />
                    </span>
                    <span className="flex-1 truncate text-[14px] font-medium text-[var(--color-ink-2)]">
                      {d.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => add(d.href)}
                      disabled={full}
                      title={full ? `Tab bar is full (max ${MAX_TABS}). Remove one first.` : 'Add to tab bar'}
                      className="rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-1 text-[12px] font-semibold text-[var(--color-ink)] disabled:opacity-40"
                    >
                      + Add
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-[var(--color-hair)] px-5 py-3.5 sm:px-6 sm:py-4">
          <button
            type="button"
            onClick={() => setDraft(DEFAULT_TABS)}
            className="text-[12.5px] font-semibold text-[var(--color-ink-2)] underline-offset-2 hover:text-[var(--color-ink)] hover:underline"
          >
            Reset to default
          </button>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={() => onSave(draft)}>
              Save
            </Button>
          </div>
        </footer>
      </div>
    </>
  )
}

// ─── Layout primitives ────────────────────────────────────────────────────

function tabClass(active: boolean) {
  return [
    'flex h-[58px] w-full touch-manipulation select-none flex-col items-center justify-center gap-0 transition-colors',
    active ? 'text-[var(--color-ink)]' : 'text-[var(--color-ink-3)]',
  ].join(' ')
}

function NavGroup({
  label,
  items,
  pathname,
  onNav,
}: {
  label?: string
  items: ReadonlyArray<{ href: string; label: string }>
  pathname: string
  onNav: () => void
}) {
  return (
    <div>
      {label && (
        <div className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[0.10em] text-[var(--color-ink-3)]">
          {label}
        </div>
      )}
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNav}
                className={
                  'flex items-center justify-between rounded-[10px] px-3 py-2 text-[13.5px] transition-colors ' +
                  (active
                    ? 'bg-[var(--color-paper)] font-semibold text-[var(--color-ink)] shadow-[var(--shadow-card)]'
                    : 'font-medium text-[var(--color-ink-2)] hover:bg-[var(--color-paper-2)] hover:text-[var(--color-ink)]')
                }
              >
                <span>{item.label}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-leaf)]" />}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SheetGroup({
  label,
  items,
  pathname,
  onNav,
}: {
  label: string
  items: ReadonlyArray<{ href: string; label: string }>
  pathname: string
  onNav: () => void
}) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.10em] text-[var(--color-ink-3)]">
        {label}
      </div>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => {
          const active = isActive(pathname, item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNav}
                className={
                  'flex items-center justify-between rounded-[12px] px-3 py-3 text-[15px] transition-colors ' +
                  (active
                    ? 'bg-[var(--color-paper)] font-semibold text-[var(--color-ink)] shadow-[var(--shadow-card)]'
                    : 'font-medium text-[var(--color-ink-2)]')
                }
              >
                <span>{item.label}</span>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-leaf)]" />}
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────
// Stroke-based at 1.7px to mirror SF Symbols' line weight on iOS.

function iconProps(active: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: active ? 'currentColor' : 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7H10v7H4a1 1 0 0 1-1-1z" />
    </svg>
  )
}
function ActivityIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M4 6h11" />
      <path d="M4 12h16" />
      <path d="M4 18h8" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="17" cy="18" r="2" />
    </svg>
  )
}
function BudgetsIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16" stroke={active ? 'var(--color-paper)' : 'currentColor'} />
      <path d="M9 14h6" stroke={active ? 'var(--color-paper)' : 'currentColor'} />
    </svg>
  )
}
function AccountsIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M3 11h18" stroke={active ? 'var(--color-paper)' : 'currentColor'} />
      <path d="M7 16h4" stroke={active ? 'var(--color-paper)' : 'currentColor'} />
    </svg>
  )
}
function MoreIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <circle cx="6" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="18" cy="12" r="1.6" fill="currentColor" />
    </svg>
  )
}
function SharedIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M15 19c0-2 1.5-4 4-4s2 0 2 0" />
    </svg>
  )
}
function RulesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 6h16M4 12h10M4 18h7" />
      <path d="M17 15l2 2 4-4" />
    </svg>
  )
}

function SettlementsIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M4 8h16M4 8l4-4M4 8l4 4" />
      <path d="M20 16H4M20 16l-4-4M20 16l-4 4" />
    </svg>
  )
}
function ChartIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M4 19h16" />
      <rect x="6" y="11" width="3" height="6" />
      <rect x="11" y="7" width="3" height="10" />
      <rect x="16" y="14" width="3" height="3" />
    </svg>
  )
}
function ScaleIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M12 4v16M4 8h16" />
      <path d="M6 8l-2 6a2 2 0 0 0 4 0z" />
      <path d="M18 8l-2 6a2 2 0 0 0 4 0z" />
    </svg>
  )
}
function TrendIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M3 17l5-5 4 4 8-8" />
      <path d="M14 8h6v6" />
    </svg>
  )
}
function LoanIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10h18" stroke={active ? 'var(--color-paper)' : 'currentColor'} />
      <path d="M7 15h4" stroke={active ? 'var(--color-paper)' : 'currentColor'} />
    </svg>
  )
}
function PiggyIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M5 11a6 6 0 0 1 12 0v6h2v-3M5 17a3 3 0 0 0 6 0" />
      <circle cx="14" cy="10" r="0.8" fill="currentColor" />
    </svg>
  )
}
function TargetIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}
function PlaneIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M3 14l18-7-7 14-2-7z" />
    </svg>
  )
}
function SettingsIcon({ active }: { active?: boolean } = {}) {
  const props = active === undefined
    ? { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
    : iconProps(active)
  return (
    <svg {...props} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
function ArrowUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}
function ArrowDownIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12l7 7 7-7" />
    </svg>
  )
}
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  )
}
