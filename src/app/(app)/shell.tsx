'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { signOut } from '../(auth)/actions'

/**
 * Maple shell. Light + dark are driven by the `.dark` class on <html>
 * (bootstrap lives in src/app/layout.tsx).
 *
 * Layout:
 *   - Desktop (md+): fixed left sidebar (240px) with household + nav + user.
 *   - Mobile (<md): top bar (wordmark + household), main content, fixed
 *     bottom tab bar with 5 destinations and a "More" sheet for the rest.
 *     This is the single biggest "feels like an app" cue when installed
 *     to the iPhone home screen as a PWA.
 */

const NAV_PRIMARY = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/transactions', label: 'Activity' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/shared', label: 'Shared' },
  { href: '/settlements', label: 'Settlements' },
] as const

const NAV_SECONDARY = [
  { href: '/pnl', label: 'Profit & Loss' },
  { href: '/balance-sheet', label: 'Balance sheet' },
  { href: '/net-worth', label: 'Net worth' },
  { href: '/loans', label: 'Loans' },
  { href: '/contributions', label: 'Contributions' },
  { href: '/goals', label: 'Goals' },
  { href: '/time-off', label: 'Time off' },
] as const

const NAV_META = [
  { href: '/setup', label: 'Setup' },
] as const

// 5 tabs is the iOS native cap. Anything beyond that goes in "More".
const TAB_BAR = [
  { href: '/dashboard', label: 'Home', icon: HomeIcon },
  { href: '/transactions', label: 'Activity', icon: ActivityIcon },
  { href: '/budgets', label: 'Budgets', icon: BudgetsIcon },
  { href: '/accounts', label: 'Accounts', icon: AccountsIcon },
  { href: '__more__', label: 'More', icon: MoreIcon },
] as const

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
}

export function AppShell({
  householdName,
  userEmail,
  children,
}: {
  householdName: string
  userEmail: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)
  const closeMore = () => setMoreOpen(false)

  // Tag <body> on mount so the global CSS rule that adjusts page padding for
  // the bottom tab bar can fire. Cleared on unmount in case we ever route
  // outside the shell.
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
          <NavGroup items={NAV_PRIMARY} pathname={pathname} onNav={closeMore} />
          <NavGroup label="Reports" items={NAV_SECONDARY} pathname={pathname} onNav={closeMore} />
          <NavGroup label="Setup" items={NAV_META} pathname={pathname} onNav={closeMore} />
        </nav>

        <div className="mt-4 border-t border-[var(--color-hair)] pt-4">
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

      {/* ───────── Mobile top bar (no hamburger — bottom tab bar replaces it) ───────── */}
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

      {/* ───────── Main content ─────────
          Pads the bottom on mobile to clear the tab bar (64px) + safe-area. */}
      <main className="md:pl-[240px]">
        <div
          className="mx-auto max-w-[720px] px-4 py-5 md:max-w-[1080px] md:px-10 md:py-10"
          style={{
            paddingBottom: 'calc(72px + env(safe-area-inset-bottom) + 16px)',
          }}
        >
          {children}
        </div>
      </main>

      {/* ───────── Mobile bottom tab bar ───────── */}
      <nav
        aria-label="Primary"
        className="maple-chrome fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-hair)] bg-[var(--color-cream)]/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto flex max-w-[520px] items-stretch justify-around px-1">
          {TAB_BAR.map((tab) => {
            if (tab.href === '__more__') {
              const moreActive =
                NAV_SECONDARY.some((i) => isActive(pathname, i.href)) ||
                NAV_META.some((i) => isActive(pathname, i.href)) ||
                isActive(pathname, '/settlements') ||
                isActive(pathname, '/shared')
              return (
                <li key="more" className="flex-1">
                  <button
                    type="button"
                    onClick={() => setMoreOpen(true)}
                    aria-haspopup="dialog"
                    aria-expanded={moreOpen}
                    className={tabClass(moreActive)}
                  >
                    <tab.icon active={moreActive} />
                    <span className="mt-0.5 text-[10.5px] font-semibold tracking-[-0.01em]">
                      {tab.label}
                    </span>
                  </button>
                </li>
              )
            }
            const active = isActive(pathname, tab.href)
            return (
              <li key={tab.href} className="flex-1">
                <Link href={tab.href} className={tabClass(active)} aria-current={active ? 'page' : undefined}>
                  <tab.icon active={active} />
                  <span className="mt-0.5 text-[10.5px] font-semibold tracking-[-0.01em]">
                    {tab.label}
                  </span>
                </Link>
              </li>
            )
          })}
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
            role="dialog"
            aria-label="More navigation"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[86vh] overflow-y-auto rounded-t-[24px] border-t border-[var(--color-hair)] bg-[var(--color-cream)] shadow-[var(--shadow-float)] md:hidden"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
          >
            <div className="flex justify-center pb-1 pt-2">
              <div className="h-1 w-10 rounded-full bg-[var(--color-hair)]" aria-hidden />
            </div>
            <div className="px-5 pb-2 pt-2">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="font-serif text-[20px] tracking-[-0.02em]">More</div>
                  <div className="truncate text-[11.5px] text-[var(--color-ink-2)]">{userEmail}</div>
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
              <SheetGroup
                label="Household"
                items={[
                  { href: '/shared', label: 'Shared' },
                  { href: '/settlements', label: 'Settlements' },
                ]}
                pathname={pathname}
                onNav={closeMore}
              />
              <SheetGroup
                label="Reports"
                items={NAV_SECONDARY}
                pathname={pathname}
                onNav={closeMore}
              />
              <SheetGroup
                label="Setup"
                items={NAV_META}
                pathname={pathname}
                onNav={closeMore}
              />
              <form action={signOut} className="mt-3 border-t border-[var(--color-hair)] px-2 pt-3">
                <button
                  type="submit"
                  className="text-[14px] font-semibold text-[var(--color-ink-2)]"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function tabClass(active: boolean) {
  return [
    'flex h-[58px] w-full flex-col items-center justify-center gap-0 transition-colors',
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
// Stroke-based at 1.7px so they match SF Symbols' line weight on iOS.

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
      <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-7H10v7H4a1 1 0 0 1-1-1z" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}
function ActivityIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <path d="M4 6h11" />
      <path d="M4 12h16" />
      <path d="M4 18h8" />
      <circle cx="19" cy="6" r="2" fill={active ? 'currentColor' : 'none'} />
      <circle cx="17" cy="18" r="2" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}
function BudgetsIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <rect x="4" y="5" width="16" height="14" rx="2" fill={active ? 'currentColor' : 'none'} stroke="currentColor" />
      <path d="M4 10h16" stroke={active ? 'var(--color-paper)' : 'currentColor'} />
      <path d="M9 14h6" stroke={active ? 'var(--color-paper)' : 'currentColor'} />
    </svg>
  )
}
function AccountsIcon({ active }: { active: boolean }) {
  return (
    <svg {...iconProps(active)} aria-hidden>
      <rect x="3" y="7" width="18" height="12" rx="2" fill={active ? 'currentColor' : 'none'} stroke="currentColor" />
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
function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
