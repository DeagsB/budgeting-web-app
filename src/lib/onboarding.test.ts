import { describe, it, expect } from 'vitest'
import {
  ONBOARDING_STEPS,
  canVisitStep,
  nextOnboardingStep,
  onboardingPath,
  onboardingStepNumber,
  type OnboardingState,
} from './onboarding'

const fresh: OnboardingState = { hasHousehold: false, role: null, accountCount: 0, completedAt: null }
const ownerNoAccounts: OnboardingState = { hasHousehold: true, role: 'owner', accountCount: 0, completedAt: null }
const ownerWithAccounts: OnboardingState = { ...ownerNoAccounts, accountCount: 2 }
const ownerDone: OnboardingState = { ...ownerWithAccounts, completedAt: '2026-08-27T00:00:00Z' }
const ownerDoneNoAccounts: OnboardingState = { ...ownerNoAccounts, completedAt: '2026-08-27T00:00:00Z' }
const invitee: OnboardingState = { hasHousehold: true, role: 'member', accountCount: 0, completedAt: null }
const adminInvitee: OnboardingState = { ...invitee, role: 'admin' }

describe('nextOnboardingStep', () => {
  it('starts at household when the user has none', () => {
    expect(nextOnboardingStep(fresh)).toBe('household')
  })
  it('sends an owner with no accounts to bank', () => {
    expect(nextOnboardingStep(ownerNoAccounts)).toBe('bank')
  })
  it('resumes an owner with accounts at invite', () => {
    expect(nextOnboardingStep(ownerWithAccounts)).toBe('invite')
  })
  it('is done once the flag is set, even with no accounts (skipped)', () => {
    expect(nextOnboardingStep(ownerDone)).toBe('done')
    expect(nextOnboardingStep(ownerDoneNoAccounts)).toBe('done')
  })
  it('never gates invitees, regardless of the owner flag', () => {
    expect(nextOnboardingStep(invitee)).toBe('done')
    expect(nextOnboardingStep(adminInvitee)).toBe('done')
  })
})

describe('canVisitStep', () => {
  it('household only before a household exists', () => {
    expect(canVisitStep(fresh, 'household')).toBe(true)
    expect(canVisitStep(ownerNoAccounts, 'household')).toBe(false)
    expect(canVisitStep(ownerDone, 'household')).toBe(false)
  })
  it('bank whenever a household exists and the flow is not done', () => {
    expect(canVisitStep(fresh, 'bank')).toBe(false)
    expect(canVisitStep(ownerNoAccounts, 'bank')).toBe(true)
    expect(canVisitStep(ownerWithAccounts, 'bank')).toBe(true)
    expect(canVisitStep(ownerDone, 'bank')).toBe(false)
  })
  it('invite and budget need at least one account', () => {
    for (const step of ['invite', 'budget'] as const) {
      expect(canVisitStep(ownerNoAccounts, step)).toBe(false)
      expect(canVisitStep(ownerWithAccounts, step)).toBe(true)
      expect(canVisitStep(ownerDone, step)).toBe(false)
    }
  })
  it('blocks every step for invitees', () => {
    for (const step of ONBOARDING_STEPS) expect(canVisitStep(invitee, step)).toBe(false)
    expect(canVisitStep(invitee, 'done')).toBe(true)
  })
})

describe('paths and numbering', () => {
  it('has four steps', () => {
    expect(ONBOARDING_STEPS).toHaveLength(4)
  })
  it('numbers steps 1..4 in order', () => {
    expect(ONBOARDING_STEPS.map(onboardingStepNumber)).toEqual([1, 2, 3, 4])
  })
  it('maps every step to a route', () => {
    expect(onboardingPath('household')).toBe('/onboarding')
    expect(onboardingPath('bank')).toBe('/onboarding/bank')
    expect(onboardingPath('invite')).toBe('/onboarding/invite')
    expect(onboardingPath('budget')).toBe('/onboarding/budget')
    expect(onboardingPath('done')).toBe('/dashboard')
  })
})
