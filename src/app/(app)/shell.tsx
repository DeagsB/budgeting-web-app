'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from '../(auth)/actions'

const NAV = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/accounts', label: 'Accounts' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/categories', label: 'Categories' },
  { href: '/members', label: 'Members' },
] as const

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

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-baseline gap-4">
            <Link href="/dashboard" className="text-lg font-semibold tracking-tight">
              {householdName}
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{userEmail}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 px-4">
          {NAV.map((item) => {
            const active =
              pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  'border-b-2 px-3 py-2 text-sm font-medium transition-colors ' +
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
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
