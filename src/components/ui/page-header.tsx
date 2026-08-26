'use client'

import { createContext, useContext, type ReactNode } from 'react'
import Link from 'next/link'
import { MapleLabel } from '@/components/ui/label'

/**
 * Provided by the app shell with the title it is already rendering in the
 * mobile top bar for the current route (`null` when the shell shows the
 * wordmark instead, e.g. on the dashboard, or outside the shell). PageHeader
 * reads it to avoid repeating the same title twice on a phone.
 */
export const ShellTitleContext = createContext<{ title: string; hasBack: boolean } | null>(null)

/**
 * Standard screen header used at the top of most routes. Replaces the
 * copy-pasted eyebrow + H1 block. Mobile-first: the title/actions row stacks
 * on small screens and sits on one baseline-aligned row from `sm:` up.
 *
 * On mobile, when the shell already shows this route's title in its top bar,
 * the eyebrow + H1 are hidden (visually only - the H1 stays in the DOM for
 * assistive tech) and only the subtitle / actions remain.
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
  const shell = useContext(ShellTitleContext)
  const shellHasTitle = shell !== null
  const shellHasBack = shell?.hasBack ?? false

  return (
    <div className={className}>
      {back ? (
        <Link
          href={back.href}
          className={
            'inline-flex min-h-[44px] items-center text-[12.5px] font-semibold text-ink-2 transition-colors hover:text-ink' +
            (shellHasBack ? ' max-md:hidden' : '')
          }
        >
          ← {back.label}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className={shellHasTitle ? 'max-md:sr-only' : ''}>
            {eyebrow ? <MapleLabel>{eyebrow}</MapleLabel> : null}
            <h1 className="font-serif text-[30px] leading-[1.04] tracking-[-0.02em] text-ink sm:text-[38px]">
              {title}
            </h1>
          </div>
          {subtitle ? (
            <p
              className={
                'max-w-[640px] text-[14px] leading-relaxed text-ink-2 ' +
                (shellHasTitle ? 'md:mt-2' : 'mt-2')
              }
            >
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </div>
  )
}
