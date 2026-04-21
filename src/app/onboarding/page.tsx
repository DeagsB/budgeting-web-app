import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { OnboardingForm } from './form'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) redirect('/sign-in')

  const ctx = await getHouseholdContext()
  if (ctx) redirect('/dashboard')

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--color-cream)] text-[var(--color-ink)]">
      {/* Warm backdrop: layered cream washes + a single soft leaf-tinted blob.
          No raw saturated gradients; keep within the Maple palette. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(1200px 520px at 85% -10%, var(--color-leaf-soft) 0%, transparent 60%),' +
            'radial-gradient(900px 420px at -10% 110%, var(--color-maple-soft) 0%, transparent 55%)',
          opacity: 0.7,
        }}
      />
      <div className="relative mx-auto flex min-h-screen max-w-[1100px] flex-col px-6 py-8 md:flex-row md:items-center md:gap-16 md:px-10 md:py-12">
        {/* Brand + welcome panel */}
        <aside className="flex flex-col justify-between md:w-[420px] md:self-stretch md:py-8">
          <div>
            <div className="font-serif text-[40px] leading-none tracking-[-0.02em] md:text-[48px]">
              Maple
            </div>
            <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ink-3)]">
              Household Finance
            </div>
          </div>

          <div className="mt-10 md:mt-0">
            <h1 className="font-serif text-[40px] leading-[1.02] tracking-[-0.02em] text-[var(--color-ink)] md:text-[56px]">
              Welcome.
              <br />
              Let&rsquo;s set up
              <br />
              your household.
            </h1>
            <p className="mt-5 max-w-[360px] text-[15px] leading-[1.55] text-[var(--color-ink-2)]">
              A household groups everyone whose spending, accounts and goals you track together.
              You can add partners and other members any time.
            </p>
          </div>

          <div className="mt-8 hidden items-center gap-2 text-[12px] text-[var(--color-ink-3)] md:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-leaf)]" />
            Step 1 of 1 · takes about 30 seconds
          </div>
        </aside>

        {/* Form card */}
        <section className="mt-8 md:mt-0 md:flex-1">
          <div className="rounded-[24px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-6 shadow-[var(--shadow-float)] md:p-8">
            <OnboardingForm />
          </div>
          <p className="mt-4 px-1 text-[12px] leading-relaxed text-[var(--color-ink-3)]">
            Your data is encrypted at rest and only visible to members of your household.
          </p>
        </section>
      </div>
    </main>
  )
}
