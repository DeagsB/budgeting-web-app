import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { AddMemberForm } from './add-form'
import { MemberRow } from './row'

export default async function MembersPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const { data: members } = await supabase
    .from('members')
    .select('id, display_name, sort_order')
    .eq('household_id', ctx.householdId)
    .order('sort_order')

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Members</h1>
        <p className="mt-1 text-sm text-gray-500">
          Everyone whose spending you track. Transactions can be assigned to a member or marked
          shared.
        </p>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Add a member</h2>
        <AddMemberForm />
      </section>

      <section className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-6 py-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          Current members
        </h2>
        <ul>
          {(members ?? []).map((m) => (
            <MemberRow key={m.id} id={m.id} name={m.display_name} />
          ))}
          {(members ?? []).length === 0 && (
            <li className="px-6 py-4 text-sm text-gray-500">No members yet.</li>
          )}
        </ul>
      </section>
    </div>
  )
}
