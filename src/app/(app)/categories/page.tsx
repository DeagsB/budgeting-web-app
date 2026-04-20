import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { AddCategoryForm } from './add-form'
import { CategoryRow } from './row'

type Cat = {
  id: string
  parent_id: string | null
  name: string
  code: string
  sort_order: number
  archived_at: string | null
}

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  const { show } = await searchParams
  const showArchived = show === 'archived'

  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const { data: rows } = await supabase
    .from('categories')
    .select('id, parent_id, name, code, sort_order, archived_at')
    .eq('household_id', ctx.householdId)
    .order('sort_order')

  const all: Cat[] = (rows ?? []) as Cat[]
  const parents = all.filter((c) => !c.parent_id)
  const childrenOf = (id: string) => all.filter((c) => c.parent_id === id)

  const visible = showArchived
    ? all.filter((c) => c.archived_at)
    : all.filter((c) => !c.archived_at)

  return (
    <div className="flex flex-col gap-8">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Categories</h1>
          <p className="mt-1 text-sm text-gray-500">
            Two-level tree. Transactions link by ID; codes are used in reports and for familiar
            shorthand.
          </p>
        </div>
        <Link
          href={showArchived ? '/categories' : '/categories?show=archived'}
          className="text-sm text-gray-500 hover:text-gray-900"
        >
          {showArchived ? '← Active' : 'Show archived →'}
        </Link>
      </header>

      {!showArchived && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Add category</h2>
          <AddCategoryForm
            parents={parents
              .filter((p) => !p.archived_at)
              .map((p) => ({ id: p.id, name: p.name, code: p.code }))}
          />
        </section>
      )}

      <section className="rounded-lg border border-gray-200 bg-white">
        <h2 className="border-b border-gray-200 px-6 py-3 text-sm font-medium uppercase tracking-wide text-gray-500">
          {showArchived ? 'Archived categories' : 'Categories'}
        </h2>
        <ul className="divide-y divide-gray-100">
          {visible.length === 0 && (
            <li className="px-6 py-6 text-sm text-gray-500">
              {showArchived ? 'Nothing archived.' : 'No categories yet.'}
            </li>
          )}
          {!showArchived &&
            parents
              .filter((p) => !p.archived_at)
              .map((p) => (
                <li key={p.id}>
                  <CategoryRow category={p} depth={0} archived={false} />
                  {childrenOf(p.id)
                    .filter((c) => !c.archived_at)
                    .map((c) => (
                      <CategoryRow key={c.id} category={c} depth={1} archived={false} />
                    ))}
                </li>
              ))}
          {showArchived &&
            visible.map((c) => (
              <li key={c.id}>
                <CategoryRow category={c} depth={c.parent_id ? 1 : 0} archived={true} />
              </li>
            ))}
        </ul>
      </section>
    </div>
  )
}
