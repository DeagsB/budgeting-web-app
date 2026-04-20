import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { ImportWizard } from './wizard'

export default async function ImportPage() {
  const ctx = await getHouseholdContext()
  if (!ctx) return null

  const supabase = await createClient()
  const [{ data: accounts }, { data: categories }, { data: members }] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('name'),
    supabase
      .from('categories')
      .select('id, parent_id, name, code')
      .eq('household_id', ctx.householdId)
      .is('archived_at', null)
      .order('sort_order'),
    supabase
      .from('members')
      .select('id, display_name')
      .eq('household_id', ctx.householdId)
      .order('sort_order'),
  ])

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Import transactions</h1>
          <p className="mt-1 text-sm text-gray-500">
            Paste CSV from your bank, brokerage, or spreadsheet. The first row must be headers.
          </p>
        </div>
        <Link href="/transactions" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to transactions
        </Link>
      </header>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Expected columns</h2>
        <p className="mt-2 text-sm text-gray-600">
          At minimum: a date column, an amount column, and a description column. Optional:
          category (by code or name), account (by name), member (by name), direction
          (out/in/debit/credit). Auto-detects common header names; you can remap below.
        </p>
      </section>

      {(accounts ?? []).length === 0 ? (
        <section className="rounded-lg border border-dashed border-gray-300 p-6 text-sm text-gray-500">
          Add at least one account first.{' '}
          <Link href="/accounts" className="font-medium text-gray-900 underline">
            Accounts
          </Link>
          .
        </section>
      ) : (
        <ImportWizard
          accounts={(accounts ?? []).map((a) => ({ id: a.id, name: a.name }))}
          categories={(categories ?? []).map((c) => ({
            id: c.id,
            parent_id: c.parent_id,
            name: c.name,
            code: c.code,
          }))}
          members={(members ?? []).map((m) => ({ id: m.id, name: m.display_name }))}
        />
      )}
    </div>
  )
}
