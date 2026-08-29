import type { ReactNode } from 'react'

/**
 * Sticky action row for the bottom of an onboarding step form. The step card
 * (OnboardingShell) is `p-6 md:p-8`, so this bleeds out to the card's own
 * edges with matching negative margins, then re-applies that padding to its
 * own content - the same technique as SheetActions (src/components/ui/sheet.tsx),
 * sized for the card instead of a sheet.
 *
 * Every onboarding step form is long enough, combined with the brand/title
 * panel stacked above it on mobile and the on-screen keyboard, that its
 * submit button can end up scrolled out of view while a field is focused.
 * Sticking the button to the bottom of the viewport keeps it reachable
 * without hunting for it past the keyboard.
 */
export function StepFormActions({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`sticky bottom-0 z-10 -mx-6 mt-4 border-t border-hair bg-cream px-6 pt-3 md:-mx-8 md:px-8 ${className}`}
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
    >
      {children}
    </div>
  )
}
