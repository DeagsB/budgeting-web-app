/**
 * Guided onboarding: pure step resolution.
 *
 * "Done" is an explicit flag (households.onboarding_completed_at, set by the
 * owner via complete_onboarding()). The step to resume at is derived from DB
 * state so skippable steps never need their own bookkeeping.
 *
 * Only the household OWNER walks the flow. Invitees join an existing household
 * and go straight to the dashboard even if the owner is still mid-onboarding.
 */

import type { HouseholdRole } from '@/lib/household'

export const ONBOARDING_STEPS = ['household', 'bank', 'invite', 'budget'] as const
export type OnboardingStepName = (typeof ONBOARDING_STEPS)[number]
export type OnboardingStep = OnboardingStepName | 'done'

export type OnboardingState = {
  hasHousehold: boolean
  role: HouseholdRole | null
  accountCount: number
  completedAt: string | null
}

const PATHS: Record<OnboardingStep, string> = {
  household: '/onboarding',
  bank: '/onboarding/bank',
  invite: '/onboarding/invite',
  budget: '/onboarding/budget',
  done: '/dashboard',
}

export function onboardingPath(step: OnboardingStep): string {
  return PATHS[step]
}

/** 1-based position shown in the "Step n of N" indicator. */
export function onboardingStepNumber(step: OnboardingStepName): number {
  return ONBOARDING_STEPS.indexOf(step) + 1
}

function isDone(s: OnboardingState): boolean {
  if (!s.hasHousehold) return false
  if (s.role !== 'owner') return true
  return s.completedAt !== null
}

/** Where the user should be sent right now. */
export function nextOnboardingStep(s: OnboardingState): OnboardingStep {
  if (!s.hasHousehold) return 'household'
  if (isDone(s)) return 'done'
  if (s.accountCount === 0) return 'bank'
  // Invite + budget are quick and skippable; re-showing invite on resume is harmless.
  return 'invite'
}

/** Whether a step page may render for this state (else redirect to nextOnboardingStep). */
export function canVisitStep(s: OnboardingState, step: OnboardingStep): boolean {
  switch (step) {
    case 'household':
      return !s.hasHousehold
    case 'bank':
      return s.hasHousehold && !isDone(s)
    case 'invite':
    case 'budget':
      return s.hasHousehold && !isDone(s) && s.accountCount > 0
    case 'done':
      return isDone(s)
  }
}
