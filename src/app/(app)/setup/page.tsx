import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { MapleLabel } from '@/components/ui/label'
import { HouseholdForm } from './household-form'
import { MembersList } from './members-list'
import { CategoriesList } from './categories-list'

/**
 * Setup — one page for household name, members, and categories.
 * Three cards stacked so it reads like a preferences screen.
 */
export default async function SetupPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null
  const supabase = await createClient()

  const [{ data: household }, { data: members }, { data: categories }] = await Promise.all([
    supabase.from('households').select('id, name').eq('id', ctx.householdId).single(),
    supabase
      .from('members')
      .select('id, display_name, sort_order, archived_at')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
    supabase
      .from('categories')
      .select('id, parent_id, name, rollover_enabled, sort_order, archived_at')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
  ])

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
          Setup
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
          Make it yours.
        </h1>
        <p className="mt-2 max-w-[620px] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          Household name, who&rsquo;s in it, and how you slice your spending.
        </p>
      </header>

      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <MapleLabel>Household</MapleLabel>
        <HouseholdForm
          id={household?.id ?? ''}
          name={household?.name ?? ''}
        />
      </section>

      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <MapleLabel>Members</MapleLabel>
        <MembersList
          members={(members ?? []).map((m) => ({
            id: m.id,
            name: m.display_name,
            archived: !!m.archived_at,
          }))}
        />
      </section>

      <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
        <MapleLabel>Categories</MapleLabel>
        <CategoriesList
          categories={(categories ?? []).map((c) => ({
            id: c.id,
            parent_id: c.parent_id,
            name: c.name,
            rollover: !!c.rollover_enabled,
            archived: !!c.archived_at,
          }))}
        />
      </section>
    </div>
  )
}
