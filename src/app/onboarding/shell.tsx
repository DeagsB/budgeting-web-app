import type { ReactNode } from 'react'

const TOTAL_STEPS = 2

/**
 * Two-panel onboarding frame shared by every step: brand + welcome copy on
 * the left (stacked above the card on mobile), the step's form card on the
 * right. Keeps the backdrop, safe-area padding and step indicator in one
 * place so steps only supply copy and a form.
 */
export function OnboardingShell({
  step,
  title,
  intro,
  eyebrow,
  children,
  footnote,
}: {
  step: number
  title: ReactNode
  intro: string
  /** Short line under the step indicator, e.g. "takes about 30 seconds". */
  eyebrow: string
  children: ReactNode
  footnote: string
}) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[var(--color-cream)] text-[var(--color-ink)]">
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
      <div className="relative mx-auto flex min-h-dvh max-w-[1100px] flex-col px-6 pb-8 pt-[calc(env(safe-area-inset-top)+24px)] md:flex-row md:items-center md:gap-16 md:px-10 md:py-12">
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
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-leaf)]" />
              Step {step} of {TOTAL_STEPS}
            </div>
            <h1 className="font-serif text-[40px] leading-[1.02] tracking-[-0.02em] text-[var(--color-ink)] md:text-[56px]">
              {title}
            </h1>
            <p className="mt-5 max-w-[360px] text-[15px] leading-[1.55] text-[var(--color-ink-2)]">{intro}</p>
          </div>

          <div className="mt-8 hidden text-[12px] text-[var(--color-ink-3)] md:block">{eyebrow}</div>
        </aside>

        {/* Form card */}
        <section className="mt-8 md:mt-0 md:flex-1">
          <div className="rounded-[24px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-6 shadow-[var(--shadow-float)] md:p-8">
            {children}
          </div>
          <p className="mt-4 px-1 text-[12px] leading-relaxed text-[var(--color-ink-3)]">{footnote}</p>
        </section>
      </div>
    </main>
  )
}
