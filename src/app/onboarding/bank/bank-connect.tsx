'use client'

import { useRouter } from 'next/navigation'
import { PlaidConnect, type PlaidAccountView } from '@/components/plaid/plaid-connect'

/** Onboarding wrapper around PlaidConnect: once a bank is mapped, move to step 3. */
export function BankConnect(props: {
  plaidConfigured: boolean
  atCap: boolean
  maxItems: number
  linkedCount: number
  accounts: PlaidAccountView[]
  canOwn: boolean
}) {
  const router = useRouter()
  return (
    <PlaidConnect
      {...props}
      variant="plain"
      returnTo="/onboarding/bank"
      onLinked={() => router.push('/onboarding/invite')}
    />
  )
}
