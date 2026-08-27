/**
 * Guided onboarding: pure step resolution.
 *
 * Two tracks. The household OWNER sets the household up: household → bank →
 * invite → budget, finished by an explicit flag
 * (households.onboarding_completed_at, set by the `complete_onboarding()`
 * RPC). Anyone who joins by INVITATION walks a shorter one into a household
 * that already exists: welcome → name → accounts, finished per member
 * (members.onboarded_at).
 *
 * The owner track resumes from DB state so its skippable steps need no
 * bookkeeping. The member track is three short screens the invitee can move
 * back and forth through until they finish, so it resumes at the start.
 */

import type { HouseholdRole } from '@/lib/household'

export const OWNER_STEPS = ['household', 'bank', 'invite', 'budget'] as const
export const MEMBER_STEPS = ['welcome', 'name', 'accounts'] as const

export type OwnerStep = (typeof OWNER_STEPS)[number]
export type MemberStep = (typeof MEMBER_STEPS)[number]
export type OnboardingStepName = OwnerStep | MemberStep
export type OnboardingStep = OnboardingStepName | 'done'

export type OnboardingState = {
  hasHousehold: boolean
  role: HouseholdRole | null
  accountCount: number
  /** Owner track: households.onboarding_completed_at. */
  completedAt: string | null
  /** Member track: this login's members.onboarded_at. */
  memberOnboardedAt: string | null
  /** Whether this login is attached to a member row at all. */
  hasMember: boolean
}

const PATHS: Record<OnboardingStep, string> = {
  household: '/onboarding',
  bank: '/onboarding/bank',
  invite: '/onboarding/invite',
  budget: '/onboarding/budget',
  welcome: '/onboarding/welcome',
  name: '/onboarding/name',
  accounts: '/onboarding/accounts',
  done: '/dashboard',
}

export function onboardingPath(step: OnboardingStep): string {
  return PATHS[step]
}

function isOwnerTrack(s: OnboardingState): boolean {
  return s.role === 'owner'
}

function isMemberStep(step: OnboardingStepName): step is MemberStep {
  return (MEMBER_STEPS as readonly string[]).includes(step)
}

/** The steps this login walks, in order. */
export function stepsFor(s: OnboardingState): readonly OnboardingStepName[] {
  return isOwnerTrack(s) ? OWNER_STEPS : MEMBER_STEPS
}

/** 1-based position shown in the "Step n of N" indicator. */
export function onboardingStepNumber(step: OnboardingStepName): number {
  const steps = isMemberStep(step) ? MEMBER_STEPS : OWNER_STEPS
  return (steps as readonly string[]).indexOf(step) + 1
}

/** How many steps the track containing `step` has. */
export function onboardingStepCount(step: OnboardingStepName): number {
  return isMemberStep(step) ? MEMBER_STEPS.length : OWNER_STEPS.length
}

function isDone(s: OnboardingState): boolean {
  if (!s.hasHousehold) return false
  if (isOwnerTrack(s)) return s.completedAt !== null
  // A login with no member row of its own has nothing to name and no accounts
  // to claim; leave it alone rather than trapping it in a flow it can't finish.
  if (!s.hasMember) return true
  return s.memberOnboardedAt !== null
}

/** Where the user should be sent right now. */
export function nextOnboardingStep(s: OnboardingState): OnboardingStep {
  if (!s.hasHousehold) return 'household'
  if (isDone(s)) return 'done'
  if (!isOwnerTrack(s)) return 'welcome'
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
      return s.hasHousehold && isOwnerTrack(s) && !isDone(s)
    case 'invite':
    case 'budget':
      return s.hasHousehold && isOwnerTrack(s) && !isDone(s) && s.accountCount > 0
    // The member track is three screens with Back and Continue between them,
    // so any of them is reachable until the member finishes.
    case 'welcome':
    case 'name':
    case 'accounts':
      return s.hasHousehold && !isOwnerTrack(s) && !isDone(s)
    case 'done':
      return isDone(s)
  }
}
