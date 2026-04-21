'use client'

import { useActionState, useMemo, useState, useEffect } from 'react'
import { parseCSV } from '@/lib/csv'
import { formatMoney, parseMoneyToCents } from '@/lib/format'
import { commitImport, type ImportState, type StagedTx } from './actions'
import { MapleLabel } from '@/components/ui/label'

type Account = { id: string; name: string }
type Category = { id: string; parent_id: string | null; name: string; code: string }
type Member = { id: string; name: string }

type FieldKey = 'ignore' | 'date' | 'amount' | 'description' | 'category' | 'account' | 'member' | 'direction'

const FIELD_OPTIONS: { value: FieldKey; label: string }[] = [
  { value: 'ignore', label: 'Ignore' },
  { value: 'date', label: 'Date' },
  { value: 'amount', label: 'Amount' },
  { value: 'description', label: 'Description' },
  { value: 'category', label: 'Category' },
  { value: 'account', label: 'Account' },
  { value: 'member', label: 'Member' },
  { value: 'direction', label: 'Direction' },
]

const HEADER_HINTS: { key: FieldKey; patterns: RegExp[] }[] = [
  { key: 'date', patterns: [/^date$/i, /^posted/i, /^transaction date$/i, /^trans date$/i] },
  {
    key: 'amount',
    patterns: [/^amount$/i, /^amt$/i, /^value$/i, /^debit\/credit$/i, /^transaction amount$/i],
  },
  {
    key: 'description',
    patterns: [/^description$/i, /^memo$/i, /^details$/i, /^payee$/i, /^notes?$/i, /^transaction description$/i],
  },
  { key: 'category', patterns: [/^category$/i, /^tag$/i] },
  { key: 'account', patterns: [/^account$/i, /^account name$/i] },
  { key: 'member', patterns: [/^member$/i, /^person$/i, /^owner$/i] },
  { key: 'direction', patterns: [/^direction$/i, /^dr\/cr$/i, /^type$/i] },
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  let m = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
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

const SAMPLE = 'Date,Description,Amount\n2026-04-01,Rent,-1950.00\n2026-04-02,Groceries - Loblaws,-84.23\n2026-04-03,Paycheque,3250.00'

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
  const headers = parsed[0] ?? []
  const bodyRows = parsed.slice(1)

  const [mapping, setMapping] = useState<FieldKey[]>([])

  // Re-seed mapping whenever the header row changes length (new paste).
  useEffect(() => {
    if (headers.length > 0 && mapping.length !== headers.length) {
      setMapping(autoDetect(headers))
    } else if (headers.length === 0 && mapping.length > 0) {
      setMapping([])
    }
  }, [headers, mapping.length])

  const categoryByCode = useMemo(
    () => new Map(categories.map((c) => [c.code.toLowerCase(), c.id])),
    [categories],
  )
  const categoryByName = useMemo(
    () => new Map(categories.map((c) => [c.name.toLowerCase(), c.id])),
    [categories],
  )
  const accountByName = useMemo(
    () => new Map(accounts.map((a) => [a.name.toLowerCase(), a.id])),
    [accounts],
  )
  const memberByName = useMemo(
    () => new Map(members.map((m) => [m.name.toLowerCase(), m.id])),
    [members],
  )

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
        else if (
          v.startsWith('out') ||
          v.startsWith('db') ||
          v.startsWith('dr') ||
          v === 'withdrawal'
        )
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

  const readyCount = stagedRows.length
  const errorCount = previewRows.filter((r) => r.error).length

  const [state, formAction, pending] = useActionState<ImportState, FormData>(commitImport, undefined)

  return (
    <div className="flex flex-col gap-5">
      {/* ─── 1. Paste ─── */}
      <Step n={1} title="Paste CSV">
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={raw ? 6 : 8}
          placeholder={SAMPLE}
          spellCheck={false}
          className="w-full rounded-[12px] border border-[var(--color-hair)] bg-[var(--color-paper)] px-3 py-2.5 font-mono text-[12px] text-[var(--color-ink)] outline-none transition-colors placeholder:text-[var(--color-ink-3)] focus:border-[var(--color-leaf)] focus:shadow-[0_0_0_3px_var(--color-leaf-soft)]"
        />
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[11.5px] text-[var(--color-ink-3)]">
          <span>{raw ? `${bodyRows.length} row${bodyRows.length === 1 ? '' : 's'} detected` : 'Headers on line 1.'}</span>
          {!raw && (
            <button
              type="button"
              onClick={() => setRaw(SAMPLE)}
              className="font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
            >
              Try a sample →
            </button>
          )}
          {raw && (
            <button
              type="button"
              onClick={() => setRaw('')}
              className="font-semibold text-[var(--color-ink-2)] hover:text-[var(--color-ink)] hover:underline"
            >
              Clear
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Field label="Default account">
            <select
              value={defaultAccountId}
              onChange={(e) => setDefaultAccountId(e.target.value)}
              className="maple-select"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default member">
            <select
              value={defaultMemberId}
              onChange={(e) => setDefaultMemberId(e.target.value)}
              className="maple-select"
            >
              <option value="">Shared</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sign convention">
            <select
              value={defaultDirection}
              onChange={(e) => setDefaultDirection(e.target.value as 'auto' | 'out' | 'in')}
              className="maple-select"
            >
              <option value="auto">Auto (respect minus sign)</option>
              <option value="out">All rows are outflows</option>
              <option value="in">All rows are inflows</option>
            </select>
          </Field>
        </div>
      </Step>

      {/* ─── 2. Map ─── */}
      {headers.length > 0 && (
        <Step n={2} title="Map columns">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {headers.map((h, i) => (
              <label key={`${i}:${h}`} className="flex flex-col gap-1">
                <span className="truncate text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                  {h || `Column ${i + 1}`}
                </span>
                <select
                  value={mapping[i] ?? 'ignore'}
                  onChange={(e) =>
                    setMapping((prev) => {
                      const copy = [...prev]
                      copy[i] = e.target.value as FieldKey
                      return copy
                    })
                  }
                  className="maple-select sm"
                >
                  {FIELD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </Step>
      )}

      {/* ─── 3. Preview ─── */}
      {previewRows.length > 0 && (
        <section className="overflow-hidden rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)]">
          <header className="flex items-baseline justify-between border-b border-[var(--color-hair)] px-5 py-3.5">
            <div className="flex items-baseline gap-3">
              <StepBadge n={3} />
              <MapleLabel>Preview</MapleLabel>
            </div>
            <div className="flex items-center gap-4 text-[11.5px]">
              <span className="flex items-center gap-1.5">
                <Dot color="var(--color-leaf)" />
                <span className="text-[var(--color-ink-2)]">
                  <b className="tabular-nums text-[var(--color-ink)]">{readyCount}</b> ready
                </span>
              </span>
              {errorCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Dot color="var(--color-maple)" />
                  <span className="text-[var(--color-ink-2)]">
                    <b className="tabular-nums text-[var(--color-maple)]">{errorCount}</b> with errors
                  </span>
                </span>
              )}
            </div>
          </header>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead
                className="sticky top-0 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]"
                style={{ background: 'var(--color-cream-2)' }}
              >
                <tr>
                  <Th>Date</Th>
                  <Th align="right">Amount</Th>
                  <Th>Description</Th>
                  <Th>Category</Th>
                  <Th>Account</Th>
                  <Th>Member</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((r, idx) => {
                  const accountName = accounts.find((a) => a.id === r.accountId)?.name ?? '—'
                  const categoryName =
                    categories.find((c) => c.id === r.categoryId)?.name ?? 'Uncategorized'
                  const memberName = r.memberId
                    ? (members.find((m) => m.id === r.memberId)?.name ?? '—')
                    : 'Shared'
                  const amt = r.amountCents
                  const isIncome = amt !== null && amt < 0
                  return (
                    <tr
                      key={idx}
                      className="border-t border-[var(--color-hair)]"
                      style={r.error ? { background: 'var(--color-maple-soft)' } : undefined}
                    >
                      <Td mono>{r.date}</Td>
                      <Td
                        align="right"
                        mono
                        style={{
                          color: amt === null ? 'var(--color-ink-3)' : isIncome ? 'var(--color-leaf)' : 'var(--color-maple)',
                        }}
                      >
                        {amt !== null ? formatMoney(amt) : r.amountRaw}
                      </Td>
                      <Td>{r.description || <span className="text-[var(--color-ink-3)]">—</span>}</Td>
                      <Td muted={categoryName === 'Uncategorized'}>{categoryName}</Td>
                      <Td>{accountName}</Td>
                      <Td muted={memberName === 'Shared'}>{memberName}</Td>
                      <Td>
                        {r.error ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                            style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
                          >
                            {r.error}
                          </span>
                        ) : (
                          <span
                            className="rounded-full px-2 py-0.5 text-[10.5px] font-semibold"
                            style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
                          >
                            Ready
                          </span>
                        )}
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ─── 4. Commit ─── */}
      {readyCount > 0 && (
        <form action={formAction} className="flex flex-wrap items-center justify-end gap-4">
          <input type="hidden" name="rows" value={JSON.stringify(stagedRows)} />
          {state && 'error' in state && state.error && (
            <p
              className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--color-maple-soft)', color: 'var(--color-maple)' }}
            >
              {state.error}
            </p>
          )}
          {state && 'ok' in state && state.ok && (
            <p
              className="rounded-[10px] px-3 py-1.5 text-[12.5px] font-medium"
              style={{ background: 'var(--color-leaf-soft)', color: 'var(--color-leaf)' }}
            >
              Imported {state.count} transaction{state.count === 1 ? '' : 's'}.
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--color-ink)] px-5 py-3 text-[13.5px] font-semibold text-[var(--color-paper)] transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {pending
              ? 'Importing…'
              : `Import ${readyCount} transaction${readyCount === 1 ? '' : 's'}`}
            {!pending && <span aria-hidden>→</span>}
          </button>
        </form>
      )}
    </div>
  )
}

// ── UI bits ──

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-[var(--color-hair)] bg-[var(--color-paper)] p-5 md:p-6">
      <header className="mb-4 flex items-baseline gap-3">
        <StepBadge n={n} />
        <MapleLabel>{title}</MapleLabel>
      </header>
      {children}
    </section>
  )
}

function StepBadge({ n }: { n: number }) {
  return (
    <span
      className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full font-serif text-[12px] tabular-nums"
      style={{ background: 'var(--color-ink)', color: 'var(--color-paper)' }}
    >
      {n}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
        {label}
      </span>
      {children}
    </label>
  )
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
}) {
  return (
    <th
      className="px-4 py-2.5 font-bold"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  mono,
  muted,
  style,
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  mono?: boolean
  muted?: boolean
  style?: React.CSSProperties
}) {
  return (
    <td
      className={
        'px-4 py-2 ' +
        (mono ? 'tabular-nums ' : '') +
        (muted ? 'text-[var(--color-ink-3)]' : 'text-[var(--color-ink)]')
      }
      style={{ textAlign: align, ...style }}
    >
      {children}
    </td>
  )
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-[8px] w-[8px] rounded-full" style={{ background: color }} />
}
