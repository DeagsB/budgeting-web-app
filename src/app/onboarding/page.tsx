import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'
import { OnboardingForm } from './form'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/sign-in')

  const ctx = await getHouseholdContext()
  if (ctx) redirect('/dashboard')

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6">
      <header>
        <h1 className="text-2xl font-semibold">Set up your household</h1>
        <p className="mt-1 text-sm text-gray-500">
          A household groups everyone whose spending you track together. You can add more members
          later.
        </p>
      </header>

      <OnboardingForm />
    </main>
  )
}
