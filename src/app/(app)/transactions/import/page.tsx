import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { MapleLabel } from '@/components/ui/label'
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

  const hasAccounts = (accounts ?? []).length > 0

  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
            Import
          </div>
          <Link
            href="/transactions"
            className="text-[12.5px] font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
          >
            ← Transactions
          </Link>
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.02em] text-[var(--color-ink)] md:text-[40px]">
          Paste a statement, keep its shape.
        </h1>
        <p className="mt-2 max-w-[620px] text-[14px] leading-relaxed text-[var(--color-ink-2)]">
          CSV from your bank, or an OFX/QFX export — the wizard handles both. We auto-detect
          common columns and dedup OFX rows by their bank-issued ID.
        </p>
      </header>

      <section
        className="flex flex-col gap-4 rounded-[20px] border border-[var(--color-hair)] p-5 md:flex-row md:items-center md:justify-between md:gap-6 md:p-6"
        style={{ background: 'var(--color-leaf-tint)' }}
      >
        <div className="min-w-0">
          <MapleLabel>Hands-free</MapleLabel>
          <p className="mt-1.5 max-w-[520px] text-[13.5px] leading-relaxed text-[var(--color-ink-2)]">
            Want every purchase to land here automatically? Forward your bank&rsquo;s
            transaction-alert emails through Gmail and we&rsquo;ll record them in seconds —
            no credentials, no monthly fees.
          </p>
        </div>
        <Link
          href="/transactions/import/auto-setup"
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-full bg-[var(--color-leaf)] px-5 py-3 text-[13.5px] font-semibold text-[var(--color-paper)] shadow-[var(--shadow-card)] transition-transform active:scale-[0.98] md:self-auto"
        >
          Set up auto-import <span aria-hidden>→</span>
        </Link>
      </section>

      <section
        className="rounded-[20px] border border-[var(--color-hair)] p-5 md:p-6"
        style={{ background: 'var(--color-cream-2)' }}
      >
        <MapleLabel>What we look for</MapleLabel>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Hint tag="CSV — required" items={['Date', 'Amount', 'Description']} />
          <Hint tag="CSV — optional" items={['Category (code or name)', 'Account (name)', 'Member (name)']} />
          <Hint tag="OFX / QFX" items={['No mapping needed', 'Bank-issued ID dedup', 'Sign convention auto']} />
        </div>
      </section>

      {!hasAccounts ? (
        <section className="rounded-[20px] border border-dashed border-[var(--color-hair)] bg-[var(--color-paper)] p-6 text-[13.5px] text-[var(--color-ink-2)]">
          Add at least one account first.{' '}
          <Link href="/accounts" className="font-semibold text-[var(--color-ink)] underline-offset-2 hover:underline">
            Go to accounts
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

function Hint({ tag, items }: { tag: string; items: string[] }) {
  return (
    <div className="rounded-[14px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-4">
      <div
        className="inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]"
        style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
      >
        {tag}
      </div>
      <ul className="mt-2 flex flex-col gap-1 text-[13px] text-[var(--color-ink-2)]">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}
