import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { signOut } from '../(auth)/actions'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const ctx = await getHouseholdContext()
  if (!ctx) redirect('/onboarding')

  const { data: household } = await supabase
    .from('households')
    .select('name')
    .eq('id', ctx.householdId)
    .single()

  const { data: members } = await supabase
    .from('members')
    .select('id, display_name')
    .eq('household_id', ctx.householdId)
    .order('sort_order')

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{household?.name ?? 'Dashboard'}</h1>
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

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Members</h2>
        <ul className="flex flex-wrap gap-2">
          {(members ?? []).map((m) => (
            <li
              key={m.id}
              className="rounded border border-gray-200 bg-gray-50 px-3 py-1 text-sm"
            >
              {m.display_name}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        Coming next: accounts, transactions, categories, budgets.
      </section>
    </main>
  )
}
