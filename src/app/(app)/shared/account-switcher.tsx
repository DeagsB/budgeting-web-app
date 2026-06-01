'use client'

import { useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Field } from '@/components/ui/field'

type Account = { id: string; name: string; owner: string }

/**
 * Source-account selector for the shared screen. Auto-submits on change —
 * picking an account navigates immediately, so there's no separate "Switch"
 * button. URL-driven so the server component reads the selection from
 * `searchParams`; `month` is preserved across the change.
 */
export function AccountSwitcher({
  accounts,
  selectedId,
  month,
}: {
  accounts: Account[]
  selectedId: string
  month: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [, startNav] = useTransition()

  function onChange(account: string) {
    const params = new URLSearchParams()
    params.set('month', month)
    params.set('account', account)
    startNav(() => router.replace(`${pathname}?${params.toString()}`, { scroll: false }))
  }

  return (
    <Field label="Source account" htmlFor="shared-account" className="sm:max-w-[320px]">
      <select
        id="shared-account"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Source account"
        className="maple-select"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} — {a.owner}
          </option>
        ))}
      </select>
    </Field>
  )
}
