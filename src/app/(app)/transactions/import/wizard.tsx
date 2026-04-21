'use client'

import { useActionState, useMemo, useState } from 'react'
import { parseCSV } from '@/lib/csv'
import { formatMoney, parseMoneyToCents } from '@/lib/format'
import { commitImport, type ImportState, type StagedTx } from './actions'

type Account = { id: string; name: string }
type Category = { id: string; parent_id: string | null; name: string; code: string }
type Member = { id: string; name: string }

type FieldKey = 'ignore' | 'date' | 'amount' | 'description' | 'category' | 'account' | 'member' | 'direction'

const HEADER_HINTS: { key: FieldKey; patterns: RegExp[] }[] = [
  { key: 'date', patterns: [/^date$/i, /^posted/i, /^transaction date$/i, /^trans date$/i] },
  {
    key: 'amount',
    patterns: [/^amount$/i, /^amt$/i, /^value$/i, /^debit\/credit$/i, /^transaction amount$/i],
  },
  { key: 'description', patterns: [/^description$/i, /^memo$/i, /^details$/i, /^payee$/i, /^notes?$/i, /^transaction description$/i] },
  { key: 'category', patterns: [/^category$/i, /^tag$/i, /^type$/i] },
  { key: 'account', patterns: [/^account$/i, /^account name$/i] },
  { key: 'member', patterns: [/^member$/i, /^person$/i, /^owner$/i] },
  { key: 'direction', patterns: [/^direction$/i, /^dr\/cr$/i, /^debit\/credit$/i, /^type$/i] },
]

function autoDetect(headers: string[]): FieldKey[] {
  const used = new Set<FieldKey>()
  return headers.map((h) => {
    for (const hint of HEADER_HINTS) {
      if (used.has(hint.key)) continue
      if (hint.patterns.some((p) => p.test(h.trim()))) {
        used.add(hint.key)
        return hint.key
      }
    }
    return 'ignore'
  })
}

function parseDateISO(raw: string): string | null {
  const s = raw.trim()
  if (!s) return null
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  // YYYY/MM/DD
  let m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  // DD/MM/YYYY or MM/DD/YYYY — ambiguous. Prefer day-first for Canadian banks
  // when the first number > 12, fall back to month-first.
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[2], 10)
    const year = m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)
    const day = a > 12 ? a : b
    const month = a > 12 ? b : a
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const d = new Date(s)
  if (!Number.isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return null
}

export function ImportWizard({
  accounts,
  categories,
  members,
}: {
  accounts: Account[]
  categories: Category[]
  members: Member[]
}) {
  const [raw, setRaw] = useState('')
  const [defaultAccountId, setDefaultAccountId] = useState(accounts[0]?.id ?? '')
  const [defaultMemberId, setDefaultMemberId] = useState('')
  const [defaultDirection, setDefaultDirection] = useState<'auto' | 'out' | 'in'>('auto')

  const parsed = useMemo(() => (raw.trim() ? parseCSV(raw) : []), [raw])
  const [mapping, setMapping] = useState<FieldKey[]>([])

  // Keep mapping length in sync with header count; seed with auto-detect.
  const headers = parsed[0] ?? []
  const bodyRows = parsed.slice(1)
  if (mapping.length !== headers.length && headers.length > 0) {
    // One-time seed when mapping is stale
    const detected = autoDetect(headers)
    if (mapping.length !== detected.length) {
      setMapping(detected)
    }
  }

  const categoryByCode = new Map(categories.map((c) => [c.code.toLowerCase(), c.id]))
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]))
  const accountByName = new Map(accounts.map((a) => [a.name.toLowerCase(), a.id]))
  const memberByName = new Map(members.map((m) => [m.name.toLowerCase(), m.id]))

  const previewRows = bodyRows.map((cells) => {
    const vm: {
      date: string
      amountRaw: string
      amountCents: number | null
      description: string
      categoryId: string | null
      accountId: string
      memberId: string | null
      direction: 'out' | 'in'
      error?: string
    } = {
      date: '',
      amountRaw: '',
      amountCents: null,
      description: '',
      categoryId: null,
      accountId: defaultAccountId,
      memberId: defaultMemberId || null,
      direction: defaultDirection === 'in' ? 'in' : 'out',
    }

    for (let i = 0; i < mapping.length; i += 1) {
      const key = mapping[i]
      const value = (cells[i] ?? '').trim()
      if (key === 'date') vm.date = value
      else if (key === 'amount') vm.amountRaw = value
      else if (key === 'description') vm.description = value
      else if (key === 'category') {
        const byCode = categoryByCode.get(value.toLowerCase())
        const byName = categoryByName.get(value.toLowerCase())
        vm.categoryId = byCode ?? byName ?? null
      } else if (key === 'account') {
        const aid = accountByName.get(value.toLowerCase())
        if (aid) vm.accountId = aid
      } else if (key === 'member') {
        const mid = memberByName.get(value.toLowerCase())
        if (mid) vm.memberId = mid
      } else if (key === 'direction') {
        const v = value.toLowerCase()
        if (v.startsWith('in') || v.startsWith('cr') || v === 'deposit') vm.direction = 'in'
        else if (v.startsWith('out') || v.startsWith('db') || v.startsWith('dr') || v === 'withdrawal')
          vm.direction = 'out'
      }
    }

    const iso = parseDateISO(vm.date)
    if (!iso) vm.error = 'Invalid date.'
    const amountAbs = parseMoneyToCents(vm.amountRaw)
    if (amountAbs === null) vm.error = vm.error ?? 'Invalid amount.'
    if (!vm.accountId) vm.error = vm.error ?? 'Account missing.'

    vm.date = iso ?? vm.date
    let signed: number | null = null
    if (amountAbs !== null) {
      // If the raw amount already had a minus sign, respect it as inflow.
      const wasNegative = /^\s*-/.test(vm.amountRaw)
      if (defaultDirection === 'auto') {
        signed = wasNegative ? -Math.abs(amountAbs) : Math.abs(amountAbs)
      } else {
        signed = vm.direction === 'in' ? -Math.abs(amountAbs) : Math.abs(amountAbs)
      }
    }
    vm.amountCents = signed

    return vm
  })

  const stagedRows: StagedTx[] = previewRows
    .filter((r) => !r.error && r.amountCents !== null && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .map((r) => ({
      occurred_on: r.date,
      amount_cents: r.amountCents!,
      description: r.description || null,
      account_id: r.accountId,
      category_id: r.categoryId,
      member_id: r.memberId,
    }))

  const [state, formAction, pending] = useActionState<ImportState, FormData>(
    commitImport,
    undefined,
  )

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">1. Paste CSV</h2>
        <textarea
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value)
            setMapping([]) // Reset so auto-detect re-runs on next parse
          }}
          rows={8}
          placeholder={'Date,Description,Amount\n2026-04-01,Rent,-1950.00\n…'}
          className="mt-3 w-full rounded border border-gray-300 px-3 py-2 font-mono text-xs"
        />
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Default account</span>
            <select
              value={defaultAccountId}
              onChange={(e) => setDefaultAccountId(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Default member</span>
            <select
              value={defaultMemberId}
              onChange={(e) => setDefaultMemberId(e.target.value)}
              className="rounded border border-gray-300 px-3 py-2"
            >
              <option value="">Shared</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-700">Sign convention</span>
            <select
              value={defaultDirection}
              onChange={(e) => setDefaultDirection(e.target.value as 'auto' | 'out' | 'in')}
              className="rounded border border-gray-300 px-3 py-2"
            >
              <option value="auto">Auto (respect minus sign)</option>
              <option value="out">All rows are outflows</option>
              <option value="in">All rows are inflows</option>
            </select>
          </label>
        </div>
      </section>

      {headers.length > 0 && (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
            2. Map columns
          </h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            {headers.map((h, i) => (
              <label key={`${i}:${h}`} className="flex flex-col gap-1 text-sm">
                <span className="text-gray-700 truncate">{h || `(col ${i + 1})`}</span>
                <select
                  value={mapping[i] ?? 'ignore'}
                  onChange={(e) =>
                    setMapping((prev) => {
                      const copy = [...prev]
                      copy[i] = e.target.value as FieldKey
                      return copy
                    })
                  }
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                >
                  <option value="ignore">Ignore</option>
                  <option value="date">Date</option>
                  <option value="amount">Amount</option>
                  <option value="description">Description</option>
                  <option value="category">Category (code or name)</option>
                  <option value="account">Account (name)</option>
                  <option value="member">Member (name)</option>
                  <option value="direction">Direction</option>
                </select>
              </label>
            ))}
          </div>
        </section>
      )}

      {previewRows.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex items-baseline justify-between border-b border-gray-200 px-6 py-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
              3. Preview
            </h2>
            <span className="text-xs text-gray-500">
              {stagedRows.length} of {previewRows.length} rows ready to import
            </span>
          </div>
          <div className="max-h-96 overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Category</th>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Member</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previewRows.map((r, idx) => {
                  const accountName = accounts.find((a) => a.id === r.accountId)?.name ?? '—'
                  const categoryName = categories.find((c) => c.id === r.categoryId)?.name ?? 'Uncategorized'
                  const memberName = r.memberId
                    ? (members.find((m) => m.id === r.memberId)?.name ?? '—')
                    : 'Shared'
                  return (
                    <tr key={idx} className={r.error ? 'bg-red-50/50 dark:bg-red-900/20' : ''}>
                      <td className="px-4 py-1 tabular-nums text-gray-700">{r.date}</td>
                      <td
                        className={`px-4 py-1 text-right tabular-nums ${
                          (r.amountCents ?? 0) < 0 ? 'text-green-700' : 'text-red-700'
                        }`}
                      >
                        {r.amountCents !== null ? formatMoney(r.amountCents) : r.amountRaw}
                      </td>
                      <td className="px-4 py-1 text-gray-900">{r.description}</td>
                      <td className="px-4 py-1 text-gray-600">{categoryName}</td>
                      <td className="px-4 py-1 text-gray-600">{accountName}</td>
                      <td className="px-4 py-1 text-gray-600">{memberName}</td>
                      <td className="px-4 py-1 text-xs">
                        {r.error ? (
                          <span className="text-red-700">{r.error}</span>
                        ) : (
                          <span className="text-green-700 dark:text-green-400">Ready</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stagedRows.length > 0 && (
        <form action={formAction} className="flex items-center justify-end gap-3">
          <input type="hidden" name="rows" value={JSON.stringify(stagedRows)} />
          {state && 'error' in state && state.error && (
            <p className="text-sm text-red-600">{state.error}</p>
          )}
          {state && 'ok' in state && state.ok && (
            <p className="text-sm text-green-700 dark:text-green-400">
              Imported {state.count} transaction{state.count === 1 ? '' : 's'}.
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {pending ? 'Importing…' : `Import ${stagedRows.length} transaction${stagedRows.length === 1 ? '' : 's'}`}
          </button>
        </form>
      )}
    </div>
  )
}
