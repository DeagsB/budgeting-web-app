'use client'

import Link from 'next/link'

/**
 * Floating action button. 56px leaf circle anchored bottom-right, clear of the
 * mobile tab bar and the iOS home indicator. Mobile-only by default - desktop
 * keeps its inline primary buttons - pass `className` to override.
 *
 * z-index sits between the tab bar (z-30) and sheets (z-50) so an open sheet
 * always covers it.
 */
export function Fab({
  label = 'Add transaction',
  onClick,
  href,
  className = '',
}: {
  label?: string
  onClick?: () => void
  href?: string
  className?: string
}) {
  const cls =
    'maple-chrome fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-leaf text-paper shadow-[var(--shadow-float)] transition-transform duration-150 active:scale-95 md:hidden ' +
    'bottom-[calc(72px+env(safe-area-inset-bottom)+16px)] ' +
    className

  const icon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )

  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {icon}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      {icon}
    </button>
  )
}
