'use client'

import { useState, useTransition } from 'react'
import { Amount } from '@/components/ui/amount'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import { MapleLabel } from '@/components/ui/label'
import { saveBalances } from './actions'
import { ownershipLabel } from '@/lib/tx-scope'

export type AccountRow = {
  id: string
  name: string
  type: string
  typeLabel: string
  ownership: string
  opening_balance_cents: number
  current_balance_cents: number | null
  /** Running balance through the selected month (opening + tx, snapshot-anchored) - see src/lib/balances.ts. */
  derived_balance_cents: number
  previous_balance_cents: number | null
  is_liability: boolean
  /** True when the account is fed by a linked bank - its balance is read-only here (lib/balances.ts isManuallyEditableBalance). */
  is_linked: boolean
}

export function BalanceSheetForm({
  month,
  monthName,
  accounts,
  onSaved,
}: {
  month: string
  monthName: string
  accounts: AccountRow[]
  onSaved?: () => void
}) {
  const assetAccounts = accounts.filter((a) => !a.is_liability)
  const liabilityAccounts = accounts.filter((a) => a.is_liability)
  const hasManual = accounts.some((a) => !a.is_linked)
  const [pending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          await saveBalances(fd)
          setSaved(true)
          setTimeout(() => {
            setSaved(false)
            onSaved?.()
          }, 900)
        })
      }
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="month" value={month} />

      <p className="text-[12.5px] leading-relaxed text-ink-2">
        {hasManual ? (
          <>
            Linked accounts sync straight from your bank - nothing to type. Enter a manual
            account&rsquo;s balance as of {monthName}; leave it blank to clear the saved snapshot
            and fall back to the opening balance.
          </>
        ) : (
          <>Every account here is linked to a bank, so balances sync automatically - nothing to enter.</>
        )}
      </p>

      <Section title="Assets" monthName={monthName} accounts={assetAccounts} />
      <Section title="Liabilities" monthName={monthName} accounts={liabilityAccounts} />

      {hasManual && (
        <div className="flex items-center justify-end gap-3 pt-1">
          <span aria-live="polite" className="text-[12.5px] font-semibold text-leaf">
            {saved ? 'Saved.' : ''}
          </span>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {pending ? 'Saving…' : 'Save manual balances'}
          </Button>
        </div>
      )}
    </form>
  )
}

function Section({
  title,
  monthName,
  accounts,
}: {
  title: string
  monthName: string
  accounts: AccountRow[]
}) {
  if (accounts.length === 0) return null
  const sum = accounts.reduce(
    (s, a) => s + (a.is_linked ? a.derived_balance_cents : (a.current_balance_cents ?? a.opening_balance_cents)),
    0,
  )
  return (
    <section className="overflow-hidden rounded-md border border-hair bg-paper">
      <div className="flex items-baseline justify-between border-b border-hair px-4 py-3">
        <MapleLabel>{title}</MapleLabel>
        <Amount cents={sum} className="text-[14px]" />
      </div>
      <DataTable minWidth={560}>
        <caption className="sr-only">{title} balances as of {monthName}</caption>
        <thead className="bg-cream-2 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
          <tr>
            <th scope="col" className="px-4 py-2 font-bold">Account</th>
            <th scope="col" className="px-3 py-2 text-right font-bold">Prev. month</th>
            <th scope="col" className="px-3 py-2 text-right font-bold">As of {monthName}</th>
            <th scope="col" className="px-3 py-2 text-right font-bold">Change</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((a) => {
            const prev = a.previous_balance_cents ?? a.opening_balance_cents
            // A linked account's balance always comes from the bank (see
            // lib/balances.ts isManuallyEditableBalance) - it's shown, never
            // typed. A manual account keeps the editable snapshot input.
            const effective = a.is_linked ? a.derived_balance_cents : (a.current_balance_cents ?? a.opening_balance_cents)
            const change = effective - prev
            const tone = change > 0 ? 'up' : change < 0 ? 'down' : 'ink'
            return (
              <tr key={a.id} className="border-t border-hair">
                <td className="px-4 py-2.5">
                  <div className="font-medium text-ink">{a.name}</div>
                  <div className="text-[11.5px] text-ink-3">
                    {a.typeLabel}
                    {' · '}
                    {ownershipLabel(a.ownership)}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right align-middle">
                  <Amount cents={prev} className="text-[13px] text-ink-3" />
                </td>
                <td className="px-3 py-2.5 text-right align-middle">
                  {a.is_linked ? (
                    <>
                      <Amount cents={a.derived_balance_cents} className="text-[14px] text-ink" />
                      <div className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                        Bank
                      </div>
                    </>
                  ) : (
                    <input
                      name={`bal:${a.id}`}
                      type="text"
                      inputMode="decimal"
                      aria-label={`${a.name} balance as of ${monthName}`}
                      defaultValue={a.current_balance_cents !== null ? (a.current_balance_cents / 100).toFixed(2) : ''}
                      placeholder={(a.opening_balance_cents / 100).toFixed(2)}
                      className="maple-input tabular w-32 text-right"
                    />
                  )}
                </td>
                <td className="px-3 py-2.5 text-right align-middle">
                  <Amount cents={change} sign="auto" tone={tone} className="text-[13px]" />
                </td>
              </tr>
            )
          })}
        </tbody>
      </DataTable>
    </section>
  )
}
