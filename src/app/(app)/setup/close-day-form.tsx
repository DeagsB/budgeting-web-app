'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { updateCloseDay } from './actions'

/** Which day of the month the shared-expense tally closes and everyone is told what they owe. */
export function CloseDayForm({ closeDay }: { closeDay: number }) {
  const router = useRouter()
  const [value, setValue] = useState(closeDay)
  const [pending, start] = useTransition()
  const [note, setNote] = useState<string | null>(null)
  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await updateCloseDay(fd)
          if (res && 'error' in res) setNote(res.error)
          else {
            setNote('Saved.')
            router.refresh()
          }
        })
      }
      className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end"
    >
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">Shared expenses close on</span>
        <select name="close_day" value={value} onChange={(e) => setValue(Number(e.target.value))} className="maple-select">
          {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
            <option key={d} value={d}>
              Day {d} of each month
            </option>
          ))}
        </select>
        <span className="text-[11px] text-ink-3">Everyone gets a push with what they owe. You can always close early from Settlements.</span>
      </label>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" size="sm" disabled={pending || value === closeDay}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {note && <span className="text-[12px] text-ink-2">{note}</span>}
      </div>
    </form>
  )
}
