// <ViewTransition> ships in the React canary that Next bundles for the App
// Router; its typings live behind the "react/canary" entry of @types/react.
/// <reference types="react/canary" />
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Fragment, useEffect, useMemo, useRef, useState, ViewTransition } from 'react'
import { signOut } from '../(auth)/actions'
import { ShellTitleContext } from '@/components/ui/page-header'
import { ToastProvider } from '@/components/ui/toast'
import { ConfirmButton } from '@/components/ui/confirm-button'
import { PullToSync } from '@/components/pull-to-sync'
import { useScrollLock } from '@/lib/use-scroll-lock'
import { useOnline } from '@/lib/run-action'
import { QuickAddProvider, useQuickAdd } from '@/lib/quick-add'
import { IOSInstallHint } from '@/components/pwa/ios-install-hint'

/**
 * Maple shell. Light + dark are driven by the `.dark` class on <html>
 * (bootstrap lives in src/app/layout.tsx).
 *
 * Layout:
 *   - Desktop (md+): fixed left sidebar (240px) with household + nav + user.
 *   - Mobile (<md): top bar (wordmark + household), main content, fixed
 *     bottom tab bar: three user-customizable slots, a raised "+" quick-add
 *     button in the centre, and More. Press-and-hold a tile in the More sheet
 *     to place it on a slot. Slot config persists in localStorage so the
 *     user's choices stick across sessions on the same device.
 */

// ─── Destination registry ────────────────────────────────────────────────
// Single source of truth for every navigable destination + the icon it
// uses on the bottom tab bar. Anything in here can be promoted to the
// tab bar; anything not on the tab bar shows up in the More sheet.

const DESTS = [
  // Spending - daily drivers (rendered unlabeled at the top of the sidebar).
  { href: '/dashboard',      label: 'Home',          tabLabel: 'Home',         icon: HomeIcon,        group: 'main'    },
  { href: '/transactions',   label: 'Transactions',  tabLabel: 'Transactions', icon: ActivityIcon,    group: 'main'    },
  { href: '/budgets',        label: 'Budgets',       tabLabel: 'Budgets',      icon: BudgetsIcon,     group: 'main'    },
  { href: '/accounts',       label: 'Accounts',      tabLabel: 'Accounts',     icon: AccountsIcon,    group: 'main'    },
  // Split & settle - shared-money tasks.
  { href: '/shared',         label: 'Shared expenses', tabLabel: 'Shared',     icon: SharedIcon,      group: 'split'   },
  { href: '/rules',          label: 'Rules',         tabLabel: 'Rules',        icon: RulesIcon,       group: 'split'   },
  // Reports - read-only financial statements.
  { href: '/pnl',            label: 'Profit & Loss', tabLabel: 'P&L',          icon: ChartIcon,       group: 'reports' },
  { href: '/balance-sheet',  label: 'Balance sheet', tabLabel: 'Balance',      icon: ScaleIcon,       group: 'reports' },
  { href: '/net-worth',      label: 'Net worth',     tabLabel: 'Net worth',    icon: TrendIcon,       group: 'reports' },
  // Plans & savings - forward-looking trackers.
  { href: '/goals',          label: 'Goals',         tabLabel: 'Goals',        icon: TargetIcon,      group: 'plans'   },
  { href: '/contributions',  label: 'Contributions', tabLabel: 'Contribs',     icon: PiggyIcon,       group: 'plans'   },
  { href: '/loans',          label: 'Loans',         tabLabel: 'Loans',        icon: LoanIcon,        group: 'plans'   },
  { href: '/time-off',       label: 'Time off',      tabLabel: 'Time off',     icon: PlaneIcon,       group: 'plans'   },
  // Setup - household name, members, categories.
  { href: '/setup',          label: 'Setup',         tabLabel: 'Setup',        icon: SettingsIcon,    group: 'setup'   },
] as const

type Dest = (typeof DESTS)[number]

// Visual height of the mobile tab bar's content (excluding the safe-area
// inset, which every consumer adds separately via env(safe-area-inset-bottom)
// so it composes cleanly). Published as --maple-tabbar-h on the shell root so
// anything under it - in this file or elsewhere - can clear the bar without
// hard-coding the number too. Matches the value already hard-coded in
// several other bottom-fixed elements across the app.
const TABBAR_HEIGHT_PX = 72
const TABBAR_HEIGHT_VAR = '--maple-tabbar-h'

// Exactly three nav slots flank the centre "+" and the fixed More button.
const TAB_SLOT_COUNT = 3
const DEFAULT_TABS = ['/dashboard', '/transactions', '/budgets']
const TAB_STORAGE_KEY = 'maple.tabBar.v2'
// Hold a More-sheet tile this long to start placing it on the bar.
const PLACE_HOLD_MS = 350
// Finger travel beyond this cancels the hold (it was a scroll, not a press).
const PLACE_MOVE_CANCEL = 10

function findDest(href: string): Dest | undefined {
  return DESTS.find((d) => d.href === href)
}

// ─── Mobile header titles ─────────────────────────────────────────────────
// Route -> { title, parent }. On phones the top bar shows the current page's
// title (and a back chevron when the route has a parent) instead of the
// wordmark, which the dashboard keeps. Longest-prefix match, so nested routes
// that aren't listed inherit their nearest ancestor's entry.

const ROUTE_TITLES: Record<string, { title: string; parent?: string }> = {
  '/dashboard':                          { title: 'Home' },
  '/transactions':                       { title: 'Transactions' },
  '/transactions/import':                { title: 'Import', parent: '/transactions' },
  '/transactions/import/auto-setup':     { title: 'Auto-import', parent: '/transactions/import' },
  '/transactions/import/plaid-setup':    { title: 'Bank sync', parent: '/transactions/import' },
  '/budgets':                            { title: 'Budgets' },
  '/accounts':                           { title: 'Accounts' },
  '/shared':                             { title: 'Shared expenses' },
  '/rules':                              { title: 'Rules' },
  '/pnl':                                { title: 'Profit & Loss' },
  '/balance-sheet':                      { title: 'Balance sheet' },
  '/net-worth':                          { title: 'Net worth' },
  '/goals':                              { title: 'Goals' },
  '/contributions':                      { title: 'Contributions' },
  '/loans':                              { title: 'Loans' },
  '/time-off':                           { title: 'Time off' },
  '/setup':                              { title: 'Setup' },
  '/categories':                         { title: 'Categories', parent: '/setup' },
}

function resolveRoute(pathname: string): { title: string; parent?: string } | null {
  let best: string | null = null
  for (const key of Object.keys(ROUTE_TITLES)) {
    if (pathname === key || pathname.startsWith(key + '/')) {
      if (best === null || key.length > best.length) best = key
    }
  }
  return best ? ROUTE_TITLES[best] : null
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

/**
 * Normalise any stored/derived list into exactly TAB_SLOT_COUNT distinct,
 * known routes. Gaps are filled with the first defaults not already present.
 */
function normalizeTabs(input: readonly string[]): string[] {
  const out: string[] = []
  for (const h of input) {
    if (out.length >= TAB_SLOT_COUNT) break
    if (findDest(h) && !out.includes(h)) out.push(h)
  }
  for (const h of DEFAULT_TABS) {
    if (out.length >= TAB_SLOT_COUNT) break
    if (!out.includes(h)) out.push(h)
  }
  return out
}

function loadTabs(): string[] {
  if (typeof window === 'undefined') return DEFAULT_TABS
  try {
    const raw = localStorage.getItem(TAB_STORAGE_KEY)
    if (!raw) return DEFAULT_TABS
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return DEFAULT_TABS
    return normalizeTabs(parsed.filter((h): h is string => typeof h === 'string'))
  } catch {
    return DEFAULT_TABS
  }
}

type Placing = { href: string; label: string }

export function AppShell(props: {
  householdName: string
  userEmail: string
  memberName?: string | null
  children: React.ReactNode
}) {
  return (
    <QuickAddProvider>
      <AppShellInner {...props} />
    </QuickAddProvider>
  )
}

function AppShellInner({
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
  // Destination picked up by press-and-hold in the More sheet, waiting for
  // the user to tap the slot it should occupy.
  const [placing, setPlacing] = useState<Placing | null>(null)
  const online = useOnline()
  const quickAdd = useQuickAdd()

  // Perf marker read by scripts/perf (hydration of the app chrome).
  useEffect(() => {
    performance.mark('maple:shell-hydrated')
  }, [])

  // Mobile top-bar title for this route. The dashboard keeps the wordmark.
  const route = useMemo(() => resolveRoute(pathname), [pathname])
  const isHome = pathname === '/dashboard'
  const parentRoute = route?.parent ? ROUTE_TITLES[route.parent] : null
  const shellTitle = useMemo(
    () => (route && !isHome ? { title: route.title, hasBack: !!route.parent } : null),
    [route, isHome],
  )

  function goBack() {
    const parent = route?.parent
    if (!parent) return
    if (window.history.length > 1) router.back()
    else router.push(parent)
  }

  // ─── Single-tap bottom-nav during momentum scroll ───
  // iOS Safari consumes the first tap that lands while the page is still
  // inertially scrolling to stop the scroll - it never becomes a `click`, so a
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
    const clean = normalizeTabs(next)
    setTabHrefs(clean)
    try { localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(clean)) } catch {}
  }

  const closeMore = () => setMoreOpen(false)

  const morePanelRef = useRef<HTMLDivElement>(null)
  useOverlay(moreOpen, morePanelRef, closeMore)

  // ─── Slot placement ───
  // While placing, selection is locked document-wide (the user is holding /
  // tapping app chrome; iOS would otherwise start selecting page text) and
  // the three slots turn into drop targets.
  useEffect(() => {
    const root = document.documentElement
    if (placing) root.classList.add('maple-place-lock')
    else root.classList.remove('maple-place-lock')
    return () => root.classList.remove('maple-place-lock')
  }, [placing])

  const cancelPlacing = () => setPlacing(null)
  function placeIntoSlot(index: number) {
    if (!placing) return
    const next = tabHrefs.slice()
    // If the route already sits in another slot, swap so nothing duplicates.
    const existing = next.indexOf(placing.href)
    if (existing >= 0) next[existing] = next[index]
    next[index] = placing.href
    saveTabs(next)
    setPlacing(null)
    try { navigator.vibrate?.(15) } catch {}
  }
  function startPlacing(item: Placing) {
    setPlacing(item)
    setMoreOpen(false)
  }

  const tabs = useMemo(
    () =>
      tabHrefs
        .map((h) => findDest(h))
        .filter((d): d is Dest => !!d)
        .slice(0, TAB_SLOT_COUNT),
    [tabHrefs],
  )
  // Anything not on the tab bar drops into the More sheet, grouped. Setup
  // isn't grouped here - it lives permanently in the fixed quick-access row
  // (with Categories and Sign out) so it never disappears or duplicates
  // depending on tab bar customisation.
  const moreItems = useMemo(() => {
    const onBar = new Set(tabHrefs)
    return {
      main: DESTS.filter((d) => d.group === 'main' && !onBar.has(d.href)),
      split: DESTS.filter((d) => d.group === 'split' && !onBar.has(d.href)),
      reports: DESTS.filter((d) => d.group === 'reports' && !onBar.has(d.href)),
      plans: DESTS.filter((d) => d.group === 'plans' && !onBar.has(d.href)),
    }
  }, [tabHrefs])

  // Tag <body> on mount so the global CSS rule that adjusts page padding for
  // the bottom tab bar can fire.
  useEffect(() => {
    const cls = 'has-tabbar'
    document.body.classList.add(cls)
    return () => document.body.classList.remove(cls)
  }, [])

  // One nav slot on the bar. While placing, the slot becomes a drop target
  // (a plain button, so no navigation can sneak through).
  function renderSlot(d: Dest, index: number) {
    const active = isActive(pathname, d.href)
    const Icon = d.icon
    const label = (
      <span className="mt-0.5 text-[10.5px] font-semibold tracking-[-0.01em]">{d.tabLabel}</span>
    )
    if (placing) {
      return (
        <button
          type="button"
          onClick={() => placeIntoSlot(index)}
          aria-label={`Place ${placing.label} in slot ${index + 1}, replacing ${d.label}`}
          className={tabClass(false) + ' maple-slot-target text-[var(--color-leaf)]'}
        >
          <span className="maple-slot-ring">
            <Icon active={false} />
          </span>
          {label}
        </button>
      )
    }
    return (
      <Link
        href={d.href}
        className={tabClass(active)}
        aria-current={active ? 'page' : undefined}
        {...tabTap(() => router.push(d.href), { nativeClick: true })}
      >
        <Icon active={active} />
        {label}
      </Link>
    )
  }

  return (
    <ShellTitleContext.Provider value={shellTitle}>
    <ToastProvider raised={!online}>
    <div
      className="min-h-dvh bg-[var(--color-cream)] text-[var(--color-ink)]"
      style={{ '--maple-tabbar-h': `${TABBAR_HEIGHT_PX}px` } as React.CSSProperties}
    >
      {/* ───────── Desktop sidebar ───────── */}
      <aside
        className="maple-chrome fixed inset-y-0 left-0 z-20 hidden w-[240px] flex-col border-r border-[var(--color-hair)] bg-[var(--color-cream-2)] px-5 py-6 md:flex"
        style={{ viewTransitionName: 'maple-sidebar' }}
      >
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
          <div className="mt-1">
            <ConfirmButton
              action={signOut}
              prompt="Sign out of Maple?"
              confirmLabel="Sign out"
              className="-mx-2 inline-flex min-h-[44px] items-center px-2 text-[12px] font-semibold text-[var(--color-ink-2)] transition-colors hover:text-[var(--color-ink)]"
            >
              Sign out
            </ConfirmButton>
          </div>
        </div>
      </aside>

      {/* ───────── Mobile top bar ─────────
          The status-bar inset above this header is painted by the fixed
          `.status-bar-band` in the root layout (dark surface for the white
          black-translucent glyphs); the header's top padding sits under it. */}
      <header
        className="maple-chrome vt-solid sticky top-0 z-20 border-b border-[var(--color-hair)] bg-[var(--color-cream)]/85 backdrop-blur md:hidden"
        style={{ viewTransitionName: 'maple-topbar' }}
      >
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-2 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+10px)]">
          {shellTitle ? (
            <>
              {route?.parent ? (
                <button
                  type="button"
                  onClick={goBack}
                  aria-label={`Back to ${parentRoute?.title ?? 'previous page'}`}
                  className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-ink)] transition-colors active:bg-[var(--color-paper-2)]"
                >
                  <ChevronLeftIcon />
                </button>
              ) : (
                <span aria-hidden />
              )}
              <div className="truncate text-center font-serif text-[17px] leading-none tracking-[-0.01em] text-[var(--color-ink)]">
                {shellTitle.title}
              </div>
            </>
          ) : (
            <Link href="/dashboard" className="col-span-2 min-w-0">
              <div className="font-serif text-[22px] leading-none tracking-[-0.02em]">Maple</div>
              <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                {householdName}
              </div>
            </Link>
          )}
          <Link
            href="/setup"
            aria-label="Settings"
            className="flex h-11 w-11 items-center justify-center justify-self-end rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] text-[var(--color-ink-2)]"
          >
            <SettingsIcon />
          </Link>
        </div>
      </header>

      {/* ───────── Main content ───────── */}
      <main className="md:pl-[240px]">
        <div
          className="mx-auto max-w-[720px] px-4 py-5 md:max-w-[1080px] md:px-10 md:py-10"
          // Tab bar + home indicator, plus whatever the iOS install hint is
          // occupying above the bar (0 when hidden - see IOSInstallHint).
          style={{
            paddingBottom: `calc(var(${TABBAR_HEIGHT_VAR}, ${TABBAR_HEIGHT_PX}px) + env(safe-area-inset-bottom) + 16px + var(--maple-hint-h, 0px))`,
          }}
        >
          {/* Pull-to-sync wraps every screen so the gesture is universal - a
              pull-down at the top of any page triggers a Gmail sync + refresh.
              <ViewTransition> cross-fades the page body on route changes
              (duration lives in globals.css under .maple-fade). The shell
              chrome (sidebar, top bar, tab bar, status band) carries its own
              view-transition-name so it is snapshotted apart from the page
              and held still - see "Shell chrome" in globals.css. */}
          <PullToSync>
            <ViewTransition default="maple-fade">{children}</ViewTransition>
          </PullToSync>
        </div>
      </main>

      {/* ───────── Mobile bottom tab bar ───────── */}
      <nav
        aria-label="Primary"
        className="maple-chrome vt-solid fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-hair)] bg-[var(--color-cream)]/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)', viewTransitionName: 'maple-tabbar' }}
      >
        <ul className="mx-auto grid max-w-[520px] grid-cols-[1fr_1fr_76px_1fr_1fr] items-stretch px-1">
          {tabs.map((d, i) => (
            <Fragment key={d.href}>
              {i === 2 && (
                <li key="quick-add" className="flex items-center justify-center">
                  <button
                    type="button"
                    aria-label="Add transaction"
                    disabled={!!placing}
                    {...(placing ? {} : tabTap(() => quickAdd.trigger()))}
                    className={
                      'flex h-[54px] w-[54px] items-center justify-center rounded-full bg-[var(--color-leaf)] text-[var(--color-paper)] shadow-[0_6px_16px_-6px_rgba(31,86,65,0.55),var(--shadow-card)] transition-[transform,opacity] duration-150 active:scale-[0.94] ' +
                      (placing ? 'opacity-40' : '')
                    }
                  >
                    <PlusIcon />
                  </button>
                </li>
              )}
              <li>{renderSlot(d, i)}</li>
            </Fragment>
          ))}
          {(() => {
            const moreActive =
              !tabs.some((d) => isActive(pathname, d.href)) && pathname !== '/'
            return (
              <li key="more">
                <button
                  type="button"
                  disabled={!!placing}
                  {...(placing ? {} : tabTap(() => setMoreOpen(true)))}
                  aria-haspopup="dialog"
                  aria-expanded={moreOpen}
                  className={tabClass(moreActive) + (placing ? ' opacity-40' : '')}
                >
                  <MoreIcon active={moreActive} />
                  <span className="mt-0.5 text-[10.5px] font-semibold tracking-[-0.01em]">More</span>
                </button>
              </li>
            )
          })()}
        </ul>
      </nav>

      {/* ───────── Slot placement overlay ─────────
          Catch layer cancels on a tap anywhere above the bar; the pill names
          what is being placed. Slots pulse as drop targets (see tabClass). */}
      {placing && (
        <>
          <div
            aria-hidden="true"
            onClick={cancelPlacing}
            className="fixed inset-x-0 top-0 z-[29] md:hidden"
            style={{ bottom: 'calc(58px + env(safe-area-inset-bottom))' }}
          />
          <div
            role="status"
            className="maple-chrome fixed left-1/2 z-[31] flex -translate-x-1/2 items-center gap-3 whitespace-nowrap rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] py-2.5 pl-4 pr-2 text-[13px] font-semibold text-[var(--color-ink)] shadow-[var(--shadow-float)] md:hidden"
            style={{ bottom: 'calc(58px + env(safe-area-inset-bottom) + 12px)' }}
          >
            <span>
              Tap a slot to place <strong className="text-[var(--color-leaf)]">{placing.label}</strong>
            </span>
            <button
              type="button"
              onClick={cancelPlacing}
              className="min-h-[36px] rounded-full px-3 text-[13px] font-bold text-[var(--color-ink-3)]"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {/* ───────── More sheet ───────── */}
      {moreOpen && (
        <>
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={closeMore}
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
          />
          <div
            ref={morePanelRef}
            role="dialog"
            aria-modal="true"
            aria-label="More navigation"
            tabIndex={-1}
            className="maple-chrome fixed inset-x-0 bottom-0 z-50 max-h-[86dvh] overflow-y-auto overscroll-contain rounded-t-xl border-t border-[var(--color-hair)] bg-[var(--color-cream)] shadow-[var(--shadow-float)] outline-none md:hidden"
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
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)]"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            <div className="px-4 pb-3">
              {/* Always here regardless of tab bar customisation: Settings
                  and Categories are real destinations (press-and-hold still
                  places them on a slot); Sign out is an action, not a page,
                  so it's excluded from placement cleanly - no hold handler
                  at all, just a tap that opens the confirm sheet. */}
              <QuickAccessRow
                pathname={pathname}
                onNav={(href) => { closeMore(); router.push(href) }}
                onHold={startPlacing}
              />
              <div className="mt-3 mb-1 flex items-center gap-3 rounded-[12px] border border-[var(--color-leaf-soft)] bg-[var(--color-leaf-tint)] px-3 py-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-paper)] text-[var(--color-leaf)]">
                  <HoldIcon />
                </span>
                <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-[var(--color-ink-2)]">
                  <span className="block font-semibold text-[var(--color-ink)]">Make it yours</span>
                  Press and hold any tile to put it on your bottom bar.
                </span>
              </div>
              {(
                [
                  ['Spending', moreItems.main],
                  ['Split & settle', moreItems.split],
                  ['Reports', moreItems.reports],
                  ['Plans & savings', moreItems.plans],
                ] as const
              ).map(([label, items]) =>
                items.length > 0 ? (
                  <TileGroup
                    key={label}
                    label={label}
                    items={items}
                    pathname={pathname}
                    onNav={(href) => { closeMore(); router.push(href) }}
                    onHold={startPlacing}
                  />
                ) : null,
              )}
              <div className="mt-4 flex items-center justify-end border-t border-[var(--color-hair)] pt-2">
                <button
                  type="button"
                  onClick={() => saveTabs(DEFAULT_TABS)}
                  className="-mx-2 inline-flex min-h-[44px] items-center px-2 text-[12.5px] font-semibold text-[var(--color-ink-3)] transition-colors hover:text-[var(--color-ink)]"
                >
                  Reset tabs
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {!online && <OfflineBanner />}
      <IOSInstallHint />
    </div>
    </ToastProvider>
    </ShellTitleContext.Provider>
  )
}

// ─── Offline banner ───────────────────────────────────────────────────────

/**
 * Slim ink pill shown while `navigator.onLine` is false. Sits just above the
 * mobile tab bar, leaving the right edge clear for the FAB; bottom-right on
 * desktop. Server-rendered pages keep showing whatever loaded last.
 */
function OfflineBanner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="maple-chrome pointer-events-none fixed left-3 right-[84px] z-30 bottom-[calc(var(--maple-tabbar-h,72px)+env(safe-area-inset-bottom)+12px+var(--maple-hint-h,0px))] md:left-auto md:right-6 md:bottom-4 md:w-auto"
    >
      <div className="flex min-h-[40px] items-center gap-2 rounded-full bg-[var(--color-ink)] px-4 text-[13px] font-medium tracking-[-0.01em] text-[var(--color-paper)] shadow-[var(--shadow-float)]">
        <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--color-maple)]" aria-hidden />
        <span className="truncate">Offline - showing what was last loaded</span>
      </div>
    </div>
  )
}

// ─── Layout primitives ────────────────────────────────────────────────────

function tabClass(active: boolean) {
  return [
    'flex h-[58px] w-full touch-manipulation select-none flex-col items-center justify-center gap-0 transition-[color,opacity] active:opacity-60',
    active ? 'text-[var(--color-leaf)]' : 'text-[var(--color-ink-3)]',
  ].join(' ')
}

// Shared by every icon tile in the More sheet - the customisable grouped
// tiles (TileGroup) and the fixed quick-access row (QuickAccessRow) alike.
function tileClass(active: boolean) {
  return (
    'maple-tile flex min-h-[84px] w-full touch-manipulation select-none flex-col items-center justify-center gap-2 rounded-[14px] border px-1.5 py-3 text-center transition-[transform,background-color] duration-150 active:scale-[0.97] ' +
    (active
      ? 'border-[var(--color-leaf-soft)] bg-[var(--color-leaf-tint)] text-[var(--color-leaf)]'
      : 'border-[var(--color-hair)] bg-[var(--color-paper)] text-[var(--color-ink)]')
  )
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
function RulesIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(false)} strokeWidth={active ? 2.2 : 1.7} aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h7" />
      <path d="M17 15l2 2 4-4" />
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
function ChevronLeftIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function HoldIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 11V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M12 10a1.5 1.5 0 0 1 3 0v2" />
      <path d="M15 11a1.5 1.5 0 0 1 3 0v4a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7L3.6 14a1.4 1.4 0 0 1 2.3-1.6L9 15" />
      <circle cx="10.5" cy="6" r="6.5" strokeDasharray="2 3" opacity="0.5" />
    </svg>
  )
}

// ─── More sheet tile grid ─────────────────────────────────────────────────

/**
 * Icon tiles for one nav group in the More sheet. Tap navigates; press-and-
 * hold (PLACE_HOLD_MS, cancelled by PLACE_MOVE_CANCEL px of travel) hands the
 * tile to the shell to place on a bottom-bar slot. Tiles are <button>s, not
 * links: iOS Safari long-pressing a real link opens a page preview that the
 * hold gesture cannot suppress.
 */
function TileGroup({
  label,
  items,
  pathname,
  onNav,
  onHold,
}: {
  label: string
  items: ReadonlyArray<Dest>
  pathname: string
  onNav: (href: string) => void
  onHold: (item: Placing) => void
}) {
  const holdRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  // Set once a hold fires so the trailing click is swallowed instead of navigating.
  const heldRef = useRef(false)

  const clearHold = () => {
    if (holdRef.current) {
      window.clearTimeout(holdRef.current.timer)
      holdRef.current = null
    }
  }

  const handlers = (d: Dest) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.button !== 0) return
      heldRef.current = false
      clearHold()
      const timer = window.setTimeout(() => {
        holdRef.current = null
        heldRef.current = true
        try { navigator.vibrate?.(10) } catch {}
        onHold({ href: d.href, label: d.label })
      }, PLACE_HOLD_MS)
      holdRef.current = { timer, x: e.clientX, y: e.clientY }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const h = holdRef.current
      if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > PLACE_MOVE_CANCEL) clearHold()
    },
    onPointerUp: clearHold,
    onPointerCancel: clearHold,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: (e: React.MouseEvent) => {
      if (heldRef.current) {
        heldRef.current = false
        e.preventDefault()
        return
      }
      onNav(d.href)
    },
  })

  return (
    <div className="mt-4">
      <div className="mb-2 px-1 text-[10.5px] font-bold uppercase tracking-[0.10em] text-[var(--color-ink-3)]">
        {label}
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((d) => {
          const active = isActive(pathname, d.href)
          const Icon = d.icon
          return (
            <li key={d.href}>
              <button
                type="button"
                draggable={false}
                aria-current={active ? 'page' : undefined}
                className={tileClass(active)}
                {...handlers(d)}
              >
                <span className={active ? 'text-[var(--color-leaf)]' : 'text-[var(--color-ink-2)]'}>
                  <Icon active={active} />
                </span>
                <span className="text-[12px] font-medium leading-tight">{d.label}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ─── More sheet quick-access row ──────────────────────────────────────────

/**
 * The first row of the More sheet, always present regardless of how the tab
 * bar is customised: Settings, Categories, Sign out. Settings and Categories
 * are real destinations and get the same press-and-hold-to-place gesture as
 * every TileGroup tile; Sign out is an action, not a page, so it can't be
 * dropped on a slot - it's excluded from placement cleanly (plain tap only,
 * no hold timer) rather than half-wiring a gesture that has nowhere to land.
 */
function QuickAccessRow({
  pathname,
  onNav,
  onHold,
}: {
  pathname: string
  onNav: (href: string) => void
  onHold: (item: Placing) => void
}) {
  const holdRef = useRef<{ timer: number; x: number; y: number } | null>(null)
  const heldRef = useRef(false)

  const clearHold = () => {
    if (holdRef.current) {
      window.clearTimeout(holdRef.current.timer)
      holdRef.current = null
    }
  }
  // Only Settings and Categories carry this - they're the only two items in
  // this row with a real href a tab slot can hold.
  const startHold = (e: React.PointerEvent, href: string, label: string) => {
    if (e.button !== 0) return
    heldRef.current = false
    clearHold()
    const timer = window.setTimeout(() => {
      holdRef.current = null
      heldRef.current = true
      try { navigator.vibrate?.(10) } catch {}
      onHold({ href, label })
    }, PLACE_HOLD_MS)
    holdRef.current = { timer, x: e.clientX, y: e.clientY }
  }
  const moveHold = (e: React.PointerEvent) => {
    const h = holdRef.current
    if (h && Math.hypot(e.clientX - h.x, e.clientY - h.y) > PLACE_MOVE_CANCEL) clearHold()
  }
  const tapOrNav = (e: React.MouseEvent, href: string) => {
    if (heldRef.current) {
      heldRef.current = false
      e.preventDefault()
      return
    }
    onNav(href)
  }

  const settingsActive = isActive(pathname, '/setup')
  const categoriesActive = isActive(pathname, '/categories')

  return (
    <ul className="grid grid-cols-3 gap-2">
      <li>
        <button
          type="button"
          draggable={false}
          aria-current={settingsActive ? 'page' : undefined}
          className={tileClass(settingsActive)}
          onPointerDown={(e) => startHold(e, '/setup', 'Settings')}
          onPointerMove={moveHold}
          onPointerUp={clearHold}
          onPointerCancel={clearHold}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => tapOrNav(e, '/setup')}
        >
          <span className={settingsActive ? 'text-[var(--color-leaf)]' : 'text-[var(--color-ink-2)]'}>
            <SettingsIcon active={settingsActive} />
          </span>
          <span className="text-[12px] font-medium leading-tight">Settings</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          draggable={false}
          aria-current={categoriesActive ? 'page' : undefined}
          className={tileClass(categoriesActive)}
          onPointerDown={(e) => startHold(e, '/categories', 'Categories')}
          onPointerMove={moveHold}
          onPointerUp={clearHold}
          onPointerCancel={clearHold}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => tapOrNav(e, '/categories')}
        >
          <span className={categoriesActive ? 'text-[var(--color-leaf)]' : 'text-[var(--color-ink-2)]'}>
            <CategoriesIcon active={categoriesActive} />
          </span>
          <span className="text-[12px] font-medium leading-tight">Categories</span>
        </button>
      </li>
      <li>
        <ConfirmButton
          action={signOut}
          prompt="Sign out of Maple?"
          confirmLabel="Sign out"
          className={tileClass(false)}
        >
          <span className="text-[var(--color-ink-2)]">
            <SignOutIcon />
          </span>
          <span className="text-[12px] font-medium leading-tight">Sign out</span>
        </ConfirmButton>
      </li>
    </ul>
  )
}

function CategoriesIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M11 3.5l8 8a2 2 0 0 1 0 2.8l-5.4 5.4a2 2 0 0 1-2.8 0L3 11V3.5z" />
      <circle cx="7.7" cy="7.7" r="1.3" fill={active ? 'var(--color-paper)' : 'currentColor'} />
    </svg>
  )
}

function SignOutIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" />
      <path d="M16 8l4 4-4 4" />
      <path d="M20 12H9" />
    </svg>
  )
}
