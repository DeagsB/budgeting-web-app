import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signOut } from '../(auth)/actions'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/sign-in')

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Signed in as {user.email}</p>
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Sign out
          </button>
        </form>
      </header>

      <section className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        You haven&apos;t set up your household yet. (Next step: household + members + accounts.)
      </section>
    </main>
  )
}
