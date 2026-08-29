import { describe, it, expect } from 'vitest'
import {
  MEMBER_STEPS,
  OWNER_STEPS,
  canVisitStep,
  nextOnboardingStep,
  onboardingPath,
  onboardingStepCount,
  onboardingStepNumber,
  stepsFor,
  type OnboardingState,
} from './onboarding'

const fresh: OnboardingState = {
  hasHousehold: false,
  role: null,
  accountCount: 0,
  completedAt: null,
  memberOnboardedAt: null,
  hasMember: false,
}
const ownerNoAccounts: OnboardingState = { ...fresh, hasHousehold: true, role: 'owner', hasMember: true }
const ownerWithAccounts: OnboardingState = { ...ownerNoAccounts, accountCount: 2 }
const ownerDone: OnboardingState = { ...ownerWithAccounts, completedAt: '2026-08-27T00:00:00Z' }
const ownerDoneNoAccounts: OnboardingState = { ...ownerNoAccounts, completedAt: '2026-08-27T00:00:00Z' }
const invitee: OnboardingState = { ...fresh, hasHousehold: true, role: 'member', hasMember: true }
const adminInvitee: OnboardingState = { ...invitee, role: 'admin' }
const inviteeDone: OnboardingState = { ...invitee, memberOnboardedAt: '2026-08-27T00:00:00Z' }
const memberWithoutSlot: OnboardingState = { ...invitee, hasMember: false }

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
  it('is done once the owner flag is set, even with no accounts (skipped)', () => {
    expect(nextOnboardingStep(ownerDone)).toBe('done')
    expect(nextOnboardingStep(ownerDoneNoAccounts)).toBe('done')
  })
  it('starts an invitee at welcome, whatever the owner flag says', () => {
    expect(nextOnboardingStep(invitee)).toBe('welcome')
    expect(nextOnboardingStep(adminInvitee)).toBe('welcome')
    expect(nextOnboardingStep({ ...invitee, completedAt: '2026-08-27T00:00:00Z' })).toBe('welcome')
  })
  it('is done once the invitee has finished their own steps', () => {
    expect(nextOnboardingStep(inviteeDone)).toBe('done')
  })
  it('leaves a login with no member row alone', () => {
    expect(nextOnboardingStep(memberWithoutSlot)).toBe('done')
  })
})

describe('canVisitStep', () => {
  it('household only before a household exists', () => {
    expect(canVisitStep(fresh, 'household')).toBe(true)
    expect(canVisitStep(ownerNoAccounts, 'household')).toBe(false)
    expect(canVisitStep(ownerDone, 'household')).toBe(false)
  })
  it('bank whenever the owner has a household and is not done', () => {
    expect(canVisitStep(fresh, 'bank')).toBe(false)
    expect(canVisitStep(ownerNoAccounts, 'bank')).toBe(true)
    expect(canVisitStep(ownerWithAccounts, 'bank')).toBe(true)
    expect(canVisitStep(ownerDone, 'bank')).toBe(false)
  })
  it('invite and budget are reachable even with no accounts, so Skip on the bank step can advance to them', () => {
    for (const step of ['invite', 'budget'] as const) {
      expect(canVisitStep(ownerNoAccounts, step)).toBe(true)
      expect(canVisitStep(ownerWithAccounts, step)).toBe(true)
      expect(canVisitStep(ownerDone, step)).toBe(false)
    }
  })
  it('keeps each track out of the other', () => {
    for (const step of OWNER_STEPS) expect(canVisitStep(invitee, step)).toBe(false)
    for (const step of MEMBER_STEPS) expect(canVisitStep(ownerNoAccounts, step)).toBe(false)
  })
  it('lets an invitee move freely between their steps until they finish', () => {
    for (const step of MEMBER_STEPS) {
      expect(canVisitStep(invitee, step)).toBe(true)
      expect(canVisitStep(inviteeDone, step)).toBe(false)
    }
    expect(canVisitStep(inviteeDone, 'done')).toBe(true)
  })
})

describe('paths and numbering', () => {
  it('has four owner steps and three member steps', () => {
    expect(OWNER_STEPS).toHaveLength(4)
    expect(MEMBER_STEPS).toHaveLength(3)
  })
  it('numbers each track from one, independently', () => {
    expect(OWNER_STEPS.map(onboardingStepNumber)).toEqual([1, 2, 3, 4])
    expect(MEMBER_STEPS.map(onboardingStepNumber)).toEqual([1, 2, 3])
    expect(onboardingStepCount('bank')).toBe(4)
    expect(onboardingStepCount('name')).toBe(3)
  })
  it('picks the track from the state', () => {
    expect(stepsFor(ownerNoAccounts)).toBe(OWNER_STEPS)
    expect(stepsFor(invitee)).toBe(MEMBER_STEPS)
  })
  it('maps every step to a route', () => {
    expect(onboardingPath('household')).toBe('/onboarding')
    expect(onboardingPath('bank')).toBe('/onboarding/bank')
    expect(onboardingPath('invite')).toBe('/onboarding/invite')
    expect(onboardingPath('budget')).toBe('/onboarding/budget')
    expect(onboardingPath('welcome')).toBe('/onboarding/welcome')
    expect(onboardingPath('name')).toBe('/onboarding/name')
    expect(onboardingPath('accounts')).toBe('/onboarding/accounts')
    expect(onboardingPath('done')).toBe('/dashboard')
  })
})
