import { redirect } from 'next/navigation'

/** Legacy step-2 URL; the step is now /onboarding/bank. Keeps old bookmarks working. */
export default function LegacyOnboardingAccountPage() {
  redirect('/onboarding/bank')
}
