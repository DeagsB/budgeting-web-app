import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-8 px-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Budgeting</h1>
        <p className="mt-2 text-gray-600">
          A household budgeting app built around a Canadian personal-finance workbook.
        </p>
      </header>

      <nav className="flex gap-3">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link
              href="/sign-in"
              className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Sign in
            </Link>
            <Link
              href="/sign-up"
              className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
            >
              Create account
            </Link>
          </>
        )}
      </nav>
    </main>
  )
}
