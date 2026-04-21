'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { signOut } from '../(auth)/actions'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/shared', label: 'Shared' },
  { href: '/settlements', label: 'Settlements' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/pnl', label: 'P&L' },
  { href: '/balance-sheet', label: 'Balance sheet' },
  { href: '/loans', label: 'Loans' },
  { href: '/contributions', label: 'Contributions' },
  { href: '/time-off', label: 'Time off' },
  { href: '/goals', label: 'Goals' },
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
  const closeMenu = () => setMenuOpen(false)

  const activeLabel = NAV.find((n) => isActive(pathname, n.href))?.label ?? 'Menu'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="min-w-0 truncate text-lg font-semibold tracking-tight"
          >
            {householdName}
          </Link>

          <div className="flex items-center gap-2">
            <span className="hidden max-w-[220px] truncate text-sm text-gray-500 md:inline">
              {userEmail}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </button>
            </form>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded border border-gray-300 text-gray-700 md:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Desktop: horizontal tab bar */}
        <nav className="mx-auto hidden max-w-6xl gap-1 overflow-x-auto px-4 md:flex">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
                  (active
                    ? 'border-gray-900 text-gray-900'
                    : 'border-transparent text-gray-500 hover:text-gray-900')
                }
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* Mobile: current page indicator below header so users always know where they are */}
        <div className="border-t border-gray-200 px-4 py-2 text-sm text-gray-500 md:hidden">
          <span className="text-xs uppercase tracking-wide text-gray-400">Page · </span>
          <span className="font-medium text-gray-900">{activeLabel}</span>
        </div>
      </header>

      {/* Mobile slide-down menu */}
      {menuOpen && (
        <>
          <button
            type="button"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-10 bg-black/40 md:hidden"
          />
          <nav className="fixed inset-x-0 top-0 z-20 max-h-[90vh] overflow-y-auto border-b border-gray-200 bg-white pt-safe shadow-lg md:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-medium text-gray-500">{userEmail}</span>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded border border-gray-300 text-gray-700"
                aria-label="Close menu"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <ul className="divide-y divide-gray-100 border-t border-gray-200 pb-2">
              {NAV.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={closeMenu}
                      className={
                        'flex items-center justify-between px-4 py-3 text-base font-medium ' +
                        (active
                          ? 'bg-gray-50 text-gray-900'
                          : 'text-gray-700 hover:bg-gray-50 active:bg-gray-100')
                      }
                    >
                      {item.label}
                      {active && <span className="text-xs uppercase tracking-wide text-gray-400">current</span>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </nav>
        </>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  )
}
