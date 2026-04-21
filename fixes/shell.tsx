'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '../(auth)/actions'

/**
 * Maple shell. Replaces the raw gray scaffolding. Light + dark are driven by
 * the `.dark` class on <html> (bootstrap lives in src/app/layout.tsx).
 *
 * Layout:
 *   - Desktop (md+): fixed left sidebar (240px) with household + nav + user.
 *   - Mobile (<md):  top bar with wordmark + hamburger; full-screen sheet nav.
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
  { href: '/loans', label: 'Loans' },
  { href: '/contributions', label: 'Contributions' },
  { href: '/goals', label: 'Goals' },
  { href: '/time-off', label: 'Time off' },
] as const

const NAV_META = [
  { href: '/categories', label: 'Categories' },
  { href: '/members', label: 'Members' },
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
  const [menuOpen, setMenuOpen] = useState(false)
  const close = () => setMenuOpen(false)

  return (
    <div className="min-h-screen bg-[var(--color-cream)] text-[var(--color-ink)]">
      {/* ───────── Desktop sidebar ───────── */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[240px] flex-col border-r border-[var(--color-hair)] bg-[var(--color-cream-2)] px-5 py-6 md:flex">
        <Link href="/dashboard" className="block">
          <div className="font-serif text-[26px] leading-none tracking-[-0.02em] text-[var(--color-ink)]">
            Maple
          </div>
          <div className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            {householdName}
          </div>
        </Link>

        <nav className="mt-8 flex flex-1 flex-col gap-6 overflow-y-auto">
          <NavGroup items={NAV_PRIMARY} pathname={pathname} onNav={close} />
          <NavGroup label="Reports" items={NAV_SECONDARY} pathname={pathname} onNav={close} />
          <NavGroup label="Setup" items={NAV_META} pathname={pathname} onNav={close} />
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

      {/* ───────── Mobile top bar ───────── */}
      <header className="sticky top-0 z-20 border-b border-[var(--color-hair)] bg-[var(--color-cream)]/85 backdrop-blur md:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/dashboard" className="min-w-0">
            <div className="font-serif text-[22px] leading-none tracking-[-0.02em]">Maple</div>
            <div className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
              {householdName}
            </div>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)] text-[var(--color-ink)] transition-transform active:scale-95"
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </header>

      {/* ───────── Mobile nav sheet ───────── */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-hidden="true"
            onClick={close}
            className="fixed inset-0 z-20 bg-black/40 md:hidden"
          />
          <nav className="fixed inset-x-0 top-0 z-30 max-h-[92vh] overflow-y-auto rounded-b-[20px] border-b border-[var(--color-hair)] bg-[var(--color-cream)] pt-[env(safe-area-inset-top)] shadow-[var(--shadow-float)] md:hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-serif text-[22px] tracking-[-0.02em]">Maple</div>
                <div className="truncate text-[11px] text-[var(--color-ink-2)]">{userEmail}</div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close menu"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-hair)] bg-[var(--color-paper)]"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="px-4 pb-6">
              <NavGroup items={NAV_PRIMARY} pathname={pathname} onNav={close} big />
              <div className="mt-5">
                <NavGroup label="Reports" items={NAV_SECONDARY} pathname={pathname} onNav={close} big />
              </div>
              <div className="mt-5">
                <NavGroup label="Setup" items={NAV_META} pathname={pathname} onNav={close} big />
              </div>
              <form action={signOut} className="mt-6 border-t border-[var(--color-hair)] pt-4">
                <button
                  type="submit"
                  className="text-[14px] font-semibold text-[var(--color-ink-2)]"
                >
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </>
      )}

      {/* ───────── Main content ───────── */}
      <main className="md:pl-[240px]">
        <div className="mx-auto max-w-[720px] px-4 py-5 md:max-w-[1080px] md:px-10 md:py-10">
          {children}
        </div>
      </main>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────

function NavGroup({
  label,
  items,
  pathname,
  onNav,
  big,
}: {
  label?: string
  items: ReadonlyArray<{ href: string; label: string }>
  pathname: string
  onNav: () => void
  big?: boolean
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
                  'flex items-center justify-between rounded-[10px] px-3 transition-colors ' +
                  (big ? 'py-3 text-[15px] ' : 'py-2 text-[13.5px] ') +
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

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  )
}
function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
