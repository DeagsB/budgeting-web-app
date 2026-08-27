import { createClient } from '@/lib/supabase/server'
import { monthStartISO } from '@/lib/format'
import { MapleLabel } from '@/components/ui/label'
import { CategoriesList } from '@/app/(app)/setup/categories-list'
import { OnboardingShell } from '../shell'
import { StepFooter } from '../step-footer'
import { requireOnboardingStep } from '../guard'
import { BudgetForm } from './budget-form'

export const dynamic = 'force-dynamic'

/**
 * Onboarding step 4 - categories + the household's standing budget. The
 * default categories were seeded with the household; rename/archive here if
 * they don't fit, then pencil in what a normal month costs. The amounts apply
 * to every month until they're changed. Skippable.
 */
export default async function OnboardingBudgetPage() {
  const { ctx } = await requireOnboardingStep('budget')
  const supabase = await createClient()

  const { data: categories } = await supabase
    .from('categories')
    .select('id, parent_id, name, sort_order, archived_at')
    .eq('household_id', ctx!.householdId)
    .order('sort_order')

  const all = categories ?? []
  const nameOf = new Map(all.map((c) => [c.id as string, c.name as string]))
  const hasChildren = new Set(all.filter((c) => c.parent_id).map((c) => c.parent_id as string))
  // Budget the leaves: children, plus parents that have no children.
  const leaves = all
    .filter((c) => !c.archived_at && !hasChildren.has(c.id as string))
    .map((c) => ({
      id: c.id as string,
      name: c.name as string,
      parentName: c.parent_id ? (nameOf.get(c.parent_id as string) ?? null) : null,
    }))

  const month = monthStartISO()

  return (
    <OnboardingShell
      step="budget"
      title={
        <>
          What does a
          <br />
          month look like?
        </>
      }
      intro="Rough numbers are fine - what you set here applies to every month until you change it. Leave a category blank to skip it."
      eyebrow="Last step"
      footer={
        <StepFooter
          backHref="/onboarding/invite"
          skip="finish"
          skipLabel="Skip and go to my dashboard"
        />
      }
      footnote="Budgets are per household. A category keeps the same amount every month, and you can override a single month from the Budgets page."
    >
      <div className="flex flex-col gap-7">
        <div>
          <MapleLabel>Categories</MapleLabel>
          <p className="mt-1 text-[13px] text-ink-2">
            We started you with a standard set. Rename, add or archive to match how you actually spend.
          </p>
          <div className="mt-3">
            <CategoriesList
              categories={all.map((c) => ({
                id: c.id as string,
                parent_id: (c.parent_id as string | null) ?? null,
                name: c.name as string,
                archived: !!c.archived_at,
              }))}
            />
          </div>
        </div>

        <div>
          <MapleLabel>Monthly budget</MapleLabel>
          <div className="mt-3">
            <BudgetForm month={month} categories={leaves} />
          </div>
        </div>
      </div>
    </OnboardingShell>
  )
}
