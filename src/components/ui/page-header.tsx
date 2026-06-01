import type { ReactNode } from 'react'
import Link from 'next/link'
import { MapleLabel } from '@/components/ui/label'

/**
 * Standard screen header used at the top of most routes. Replaces the
 * copy-pasted eyebrow + H1 block. Mobile-first: the title/actions row stacks
 * on small screens and sits on one baseline-aligned row from `sm:` up.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  back,
  className = '',
}: {
  eyebrow?: string
  title: string
  subtitle?: string
  actions?: ReactNode
  back?: { href: string; label: string }
  className?: string
}) {
  return (
    <div className={className}>
      {back ? (
        <Link
          href={back.href}
          className="inline-flex min-h-[44px] items-center text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink"
        >
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow ? <MapleLabel>{eyebrow}</MapleLabel> : null}
          <h1 className="font-serif text-[30px] leading-[1.04] tracking-[-0.02em] text-ink sm:text-[38px]">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-[640px] text-[14px] leading-relaxed text-ink-2">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  )
}
