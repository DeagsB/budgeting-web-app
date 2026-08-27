import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { PageHeader } from '@/components/ui/page-header'
import { Card } from '@/components/ui/card'
import { CategoriesList } from '@/app/(app)/setup/categories-list'

type Cat = {
  id: string
  parent_id: string | null
  name: string
  code: string
  sort_order: number
  archived_at: string | null
}

/**
 * /categories renders the same list component as Setup, with the report
 * shorthand (code) exposed. One list, one visual language, one set of server
 * actions; the archived toggle is client state inside the list.
 */
export default async function CategoriesPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('categories')
    .select('id, parent_id, name, code, sort_order, archived_at')
    .eq('household_id', ctx.householdId)
    .order('sort_order')

  const all: Cat[] = (rows ?? []) as Cat[]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Categories"
        title="Group spending your way."
        subtitle="Add a short code like GROC to see it in reports."
      />

      <Card padding="lg">
        <CategoriesList
          withCodes
          categories={all.map((c) => ({
            id: c.id,
            parent_id: c.parent_id,
            name: c.name,
            code: c.code,
            archived: !!c.archived_at,
          }))}
        />
      </Card>
    </div>
  )
}
