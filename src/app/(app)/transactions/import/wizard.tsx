'use client'

import { useActionState, useMemo, useState, useEffect, useRef, useTransition } from 'react'
import { parseCSV } from '@/lib/csv'
import { parseMoneyToCents } from '@/lib/format'
import { parseOFX } from '@/lib/ofx'
import { commitImport, analyzeImport, type ImportState, type StagedTx, type RowAnnotation } from './actions'
import { MapleLabel } from '@/components/ui/label'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { Amount } from '@/components/ui/amount'

type Account = { id: string; name: string }
type Category = { id: string; parent_id: string | null; name: string; code: string }

type FieldKey = 'ignore' | 'date' | 'amount' | 'description' | 'category' | 'account' | 'direction'

const FIELD_OPTIONS: { value: FieldKey; label: string }[] = [
  { value: 'ignore', label: 'Ignore' },
  { value: 'date', label: 'Date' },
  { value: 'amount', label: 'Amount' },
  { value: 'description', label: 'Description' },
  { value: 'category', label: 'Category' },
  { value: 'account', label: 'Account' },
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

type OfxLite = {
  fitid: string
  date: string
  amountCents: number          // signed: positive = outflow
  description: string | null
}

type PreviewRow = {
  date: string
  amountRaw: string
  amountCents: number | null
  description: string
  categoryId: string | null
  accountId: string
  direction: 'out' | 'in'
  externalId?: string | null
  error?: string
}

export function ImportWizard({
  accounts,
  categories,
}: {
  accounts: Account[]
  categories: Category[]
}) {
  const [raw, setRaw] = useState('')
  const [ofxRows, setOfxRows] = useState<OfxLite[] | null>(null)
  const [ofxFileName, setOfxFileName] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [defaultAccountId, setDefaultAccountId] = useState(accounts[0]?.id ?? '')
  const [defaultDirection, setDefaultDirection] = useState<'auto' | 'out' | 'in'>('auto')

  const inputMode: 'csv' | 'ofx' = ofxRows ? 'ofx' : 'csv'

  const parsed = useMemo(() => (raw.trim() ? parseCSV(raw) : []), [raw])
  const headers = useMemo(() => parsed[0] ?? [], [parsed])
  const bodyRows = useMemo(() => parsed.slice(1), [parsed])

  async function handleFile(file: File) {
    setFileError(null)
    const text = await file.text()
    const looksOfx = /\.(ofx|qfx)$/i.test(file.name) || /<OFX\b/i.test(text)
    if (looksOfx) {
      try {
        const result = parseOFX(text)
        if (result.transactions.length === 0) {
          setFileError('No transactions found in this OFX file.')
          return
        }
        setRaw('')
        setOfxRows(
          result.transactions.map((t) => ({
            fitid: t.fitid,
            date: t.postedOn,
            amountCents: t.amountCents,
            description: t.description ?? t.memo,
          })),
        )
        setOfxFileName(file.name)
      } catch (e) {
        setFileError(e instanceof Error ? e.message : 'Failed to parse OFX.')
      }
    } else {
      // CSV fallback - dump into the textarea so the existing pipeline runs.
      setOfxRows(null)
      setOfxFileName(null)
      setRaw(text)
    }
  }

  function clearAll() {
    setRaw('')
    setOfxRows(null)
    setOfxFileName(null)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const [mapping, setMapping] = useState<FieldKey[]>([])

  // Re-seed mapping whenever the header row changes length (new paste). The
  // setState-in-effect is deliberate here - auto-detect has to react to
  // *parsed* input, not to a direct user action.
  useEffect(() => {
    if (headers.length > 0 && mapping.length !== headers.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // OFX mode → synthesize preview rows directly from parsed transactions.
  // Skips the CSV column-mapping step entirely since OFX is structured.
  const ofxPreviewRows =
    inputMode === 'ofx' && ofxRows
      ? ofxRows.map((r) => {
          const vm: PreviewRow = {
            date: r.date,
            amountRaw: (r.amountCents / 100).toFixed(2),
            amountCents: r.amountCents,
            description: r.description ?? '',
            categoryId: null,
            accountId: defaultAccountId,
            direction: r.amountCents >= 0 ? 'out' : 'in',
            externalId: r.fitid,
          }
          if (!/^\d{4}-\d{2}-\d{2}$/.test(vm.date)) vm.error = 'Invalid date.'
          if (!vm.accountId) vm.error = vm.error ?? 'Account missing.'
          return vm
        })
      : []

  const csvPreviewRows: PreviewRow[] = inputMode === 'ofx' ? [] : bodyRows.map((cells) => {
    const vm: PreviewRow = {
      date: '',
      amountRaw: '',
      amountCents: null,
      description: '',
      categoryId: null,
      accountId: defaultAccountId,
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

  const previewRows: PreviewRow[] =
    inputMode === 'ofx' ? ofxPreviewRows : csvPreviewRows

  const stagedRows: StagedTx[] = previewRows
    .filter((r) => !r.error && r.amountCents !== null && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .map((r) => ({
      occurred_on: r.date,
      amount_cents: r.amountCents!,
      description: r.description || null,
      account_id: r.accountId,
      category_id: r.categoryId,
      external_id: r.externalId ?? null,
      source: inputMode === 'ofx' ? 'ofx_import' : 'csv_import',
    }))

  const readyCount = stagedRows.length
  const errorCount = previewRows.filter((r) => r.error).length

  // ─── Reconciliation: match staged rows against existing transactions
  // (mainly the email-alert rows) and suggest categories from history. Runs
  // server-side because the client doesn't have the existing ledger.
  const [annotations, setAnnotations] = useState<RowAnnotation[] | null>(null)
  const [analyzing, startAnalyze] = useTransition()

  // The preview indices that survive into stagedRows, in the same order - lets
  // us zip annotations back onto the rendered preview rows.
  const readyPreviewIdx = useMemo(
    () =>
      previewRows
        .map((r, idx) => ({ r, idx }))
        .filter(({ r }) => !r.error && r.amountCents !== null && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
        .map(({ idx }) => idx),
    [previewRows],
  )

  // Signature of what would be analyzed; re-analyze only when it actually changes.
  const stagedSig = useMemo(
    () => JSON.stringify(stagedRows.map((r) => [r.account_id, r.amount_cents, r.occurred_on, r.description])),
    [stagedRows],
  )
  const analyzedSigRef = useRef<string>('')
  useEffect(() => {
    if (readyCount === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAnnotations(null)
      analyzedSigRef.current = ''
      return
    }
    if (stagedSig === analyzedSigRef.current) return
    analyzedSigRef.current = stagedSig
    const rowsAtAnalyze = stagedRows
    startAnalyze(async () => {
      try {
        const result = await analyzeImport(rowsAtAnalyze)
        setAnnotations(result)
      } catch {
        setAnnotations(null)
      }
    })
    // stagedRows is captured at call time; the signature gates re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedSig, readyCount])

  const annByIdx = useMemo(() => {
    const m = new Map<number, RowAnnotation>()
    if (annotations && annotations.length === readyPreviewIdx.length) {
      readyPreviewIdx.forEach((pIdx, i) => m.set(pIdx, annotations[i]))
    }
    return m
  }, [annotations, readyPreviewIdx])

  // Final commit payload: fold in the matched-transaction id (enrich, no
  // duplicate) and any suggested category onto each staged row.
  const mergedStaged: StagedTx[] = useMemo(() => {
    if (!annotations || annotations.length !== stagedRows.length) return stagedRows
    return stagedRows.map((r, i) => ({
      ...r,
      matched_tx_id: annotations[i].matchedTxId,
      category_id: r.category_id ?? annotations[i].suggestedCategoryId,
    }))
  }, [stagedRows, annotations])

  const matchedCount = annotations ? annotations.filter((a) => a.matchedTxId).length : 0
  const autoCatCount = annotations ? annotations.filter((a) => a.suggestedCategoryId).length : 0
  const newCount = readyCount - matchedCount

  const [state, formAction, pending] = useActionState<ImportState, FormData>(commitImport, undefined)

  // After a successful commit, clear the parsed input so the staged-rows
  // <input> empties out - without this the same payload sits in the form and a
  // second click would re-submit (and re-skip) every row. The success banner
  // reads from `state`, which survives clearAll(), so the confirmation stays
  // visible. Tracked with a ref so we only reset once per successful action.
  const handledSuccessRef = useRef(false)
  const importOk = !!(state && 'ok' in state && state.ok)
  useEffect(() => {
    if (importOk && !handledSuccessRef.current) {
      handledSuccessRef.current = true
      clearAll()
    }
    if (!importOk) handledSuccessRef.current = false
    // clearAll only resets local input state; depending on importOk alone is
    // intentional so we don't re-run every render.
  }, [importOk])

  return (
    <div className="flex flex-col gap-5">
      {/* ─── 1. Paste or upload ─── */}
      <Step n={1} title={inputMode === 'ofx' ? 'OFX file loaded' : 'Paste CSV or upload a file'}>
        {inputMode === 'ofx' ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 rounded-md border border-hair bg-cream-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[12.5px] text-ink">
                  {ofxFileName}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-2">
                  {ofxRows!.length} transaction{ofxRows!.length === 1 ? '' : 's'} parsed.
                  Each carries a bank-issued ID - re-importing the same file is safe (duplicates are skipped).
                </div>
              </div>
              <button
                type="button"
                onClick={clearAll}
                aria-label="Clear loaded OFX file"
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-full px-3 text-[12.5px] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
              >
                Clear
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* .maple-textarea keeps the input at 16px on mobile (no iOS
                focus-zoom) and steps down to 14px at sm:+. Do not re-add a
                per-field text-[NNpx] override here. */}
            <textarea
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              rows={raw ? 6 : 8}
              placeholder={SAMPLE}
              spellCheck={false}
              aria-label="Paste CSV statement"
              className="maple-textarea font-mono"
            />
            <div className="mt-1.5 flex flex-col gap-2 text-[12px] text-ink-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span>{raw ? `${bodyRows.length} row${bodyRows.length === 1 ? '' : 's'} detected` : 'Headers on line 1.'}</span>
              <div className="flex flex-wrap items-center gap-1">
                <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-full px-3 text-[12.5px] font-semibold text-ink-2 hover:text-ink hover:underline">
                  Upload .csv / .ofx / .qfx
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.ofx,.qfx,text/csv,application/x-ofx"
                    aria-label="Upload a CSV, OFX, or QFX file"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) handleFile(f)
                    }}
                    className="hidden"
                  />
                </label>
                {!raw && (
                  <button
                    type="button"
                    onClick={() => setRaw(SAMPLE)}
                    className="inline-flex min-h-[44px] items-center rounded-full px-3 text-[12.5px] font-semibold text-ink-2 hover:text-ink hover:underline"
                  >
                    Try a sample →
                  </button>
                )}
                {raw && (
                  <button
                    type="button"
                    onClick={clearAll}
                    aria-label="Clear pasted CSV"
                    className="inline-flex min-h-[44px] items-center rounded-full px-3 text-[12.5px] font-semibold text-ink-2 hover:text-ink hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            {/* Always-rendered live region so screen readers announce parse /
                file errors the moment they appear. */}
            <div aria-live="assertive" role="alert">
              {fileError && (
                <p className="mt-2 rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
                  {fileError}
                </p>
              )}
            </div>
          </>
        )}

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
          <Field label="Sign convention">
            <select
              value={defaultDirection}
              onChange={(e) => setDefaultDirection(e.target.value as 'auto' | 'out' | 'in')}
              className="maple-select"
              disabled={inputMode === 'ofx'}
              title={inputMode === 'ofx' ? 'OFX files include a sign - this is ignored.' : undefined}
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
                <span className="truncate text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                  {h || `Column ${i + 1}`}
                </span>
                <select
                  value={mapping[i] ?? 'ignore'}
                  aria-label={`Map column "${h || `Column ${i + 1}`}" to a field`}
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
        <section className="overflow-hidden rounded-lg border border-hair bg-paper">
          <header className="flex items-baseline justify-between border-b border-hair px-5 py-3.5">
            <div className="flex items-baseline gap-3">
              <StepBadge n={3} />
              <MapleLabel>Preview</MapleLabel>
            </div>
            <div className="flex items-center gap-4 text-[11.5px]">
              {analyzing && <span className="text-ink-3">Checking matches…</span>}
              <span className="flex items-center gap-1.5">
                <Dot className="bg-leaf" />
                <span className="text-ink-2">
                  <b className="tabular-nums text-ink">{newCount}</b> new
                </span>
              </span>
              {matchedCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Dot className="bg-ink-3" />
                  <span className="text-ink-2">
                    <b className="tabular-nums text-ink">{matchedCount}</b> match existing
                  </span>
                </span>
              )}
              {autoCatCount > 0 && (
                <span className="text-ink-3">· {autoCatCount} auto-categorized</span>
              )}
              {errorCount > 0 && (
                <span className="flex items-center gap-1.5">
                  <Dot className="bg-maple" />
                  <span className="text-ink-2">
                    <b className="tabular-nums text-maple">{errorCount}</b> with errors
                  </span>
                </span>
              )}
            </div>
          </header>
          <div className="max-h-[420px] overflow-auto">
            {/* Mobile: card stack, leading Status + Amount so the two columns
                that decide whether a row imports are reachable at 375px without
                any horizontal scrolling. */}
            <ul className="flex flex-col gap-2 p-3 sm:hidden">
              {previewRows.map((r, idx) => {
                const d = derivePreview(r, accounts, categories, annByIdx.get(idx))
                return (
                  <li
                    key={idx}
                    className={`rounded-md border border-hair p-3 ${
                      r.error ? 'bg-maple-soft' : 'bg-paper'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <StatusChip error={r.error} matched={d.matched} />
                      {d.amt !== null ? (
                        <Amount
                          cents={d.amt}
                          sign="auto"
                          tone={d.isIncome ? 'leaf' : 'maple'}
                          className="font-mono text-[14px]"
                        />
                      ) : (
                        <span className="font-mono text-[14px] tabular-nums text-ink-3">
                          {r.amountRaw}
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-[13px] text-ink">
                      {r.description || (
                        <span className="text-ink-3">No description</span>
                      )}
                    </div>
                    {d.matched && (
                      <div className="mt-1 text-[11px] text-ink-3">
                        Enriches an existing transaction{d.matchedDate ? ` from ${d.matchedDate}` : ''} - no duplicate.
                      </div>
                    )}
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11.5px]">
                      <MetaPair label="Date" value={r.date || '-'} mono />
                      <MetaPair label="Account" value={d.accountName} />
                      <MetaPair
                        label="Category"
                        value={d.categorySuggested ? `${d.categoryName} · suggested` : d.categoryName}
                        muted={d.categoryName === 'Uncategorized'}
                      />
                    </dl>
                  </li>
                )
              })}
            </ul>

            {/* Desktop / wider: full table inside DataTable. Status + Amount
                lead so the verdict columns show before any horizontal scroll. */}
            <div className="hidden sm:block">
              <DataTable minWidth={820}>
                <thead className="sticky top-0 bg-cream-2 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
                  <tr>
                    <Th>Status</Th>
                    <Th align="right">Amount</Th>
                    <Th>Date</Th>
                    <Th>Description</Th>
                    <Th>Category</Th>
                    <Th>Account</Th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((r, idx) => {
                    const d = derivePreview(r, accounts, categories, annByIdx.get(idx))
                    return (
                      <tr
                        key={idx}
                        className={`border-t border-hair ${r.error ? 'bg-maple-soft' : ''}`}
                      >
                        <Td>
                          <StatusChip error={r.error} matched={d.matched} />
                        </Td>
                        <Td align="right" mono>
                          {d.amt !== null ? (
                            <Amount cents={d.amt} sign="auto" tone={d.isIncome ? 'leaf' : 'maple'} />
                          ) : (
                            <span className="text-ink-3">{r.amountRaw}</span>
                          )}
                        </Td>
                        <Td mono>{r.date}</Td>
                        <Td>
                          {r.description || <span className="text-ink-3">-</span>}
                          {d.matched && (
                            <span className="ml-1.5 text-[11px] text-ink-3">· enriches existing</span>
                          )}
                        </Td>
                        <Td muted={d.categoryName === 'Uncategorized'}>
                          {d.categoryName}
                          {d.categorySuggested && (
                            <span className="ml-1 text-[10.5px] text-ink-3">· suggested</span>
                          )}
                        </Td>
                        <Td>{d.accountName}</Td>
                      </tr>
                    )
                  })}
                </tbody>
              </DataTable>
            </div>
          </div>
        </section>
      )}

      {/* ─── 4. Commit ─── */}
      {/* Always-rendered live region: the success banner has to survive the
          post-import reset (which empties the staged rows and unmounts the form
          below) so the user still sees the confirmation, and screen readers
          announce both success and failure. */}
      <div aria-live="polite" role="status">
        {state && 'error' in state && state.error && (
          <p className="rounded-md bg-maple-soft px-3 py-1.5 text-[12.5px] font-medium text-maple">
            {state.error}
          </p>
        )}
        {state && 'ok' in state && state.ok && (
          <p className="rounded-md bg-leaf-soft px-3 py-1.5 text-[12.5px] font-medium text-leaf">
            Imported {state.count} transaction{state.count === 1 ? '' : 's'}
            {state.reconciled > 0 && `, enriched ${state.reconciled} existing`}
            {state.skipped > 0 && `, skipped ${state.skipped} duplicate${state.skipped === 1 ? '' : 's'}`}
            .
          </p>
        )}
      </div>

      {readyCount > 0 && (
        <form action={formAction} className="flex flex-wrap items-center justify-end gap-4">
          <input type="hidden" name="rows" value={JSON.stringify(mergedStaged)} />
          <Button type="submit" variant="primary" disabled={pending || analyzing}>
            {pending
              ? 'Importing…'
              : analyzing
                ? 'Checking matches…'
                : matchedCount > 0
                  ? `Import ${newCount} new · enrich ${matchedCount}`
                  : `Import ${readyCount} transaction${readyCount === 1 ? '' : 's'}`}
            {!pending && !analyzing && <span aria-hidden>→</span>}
          </Button>
        </form>
      )}
    </div>
  )
}

// ── UI bits ──

// Resolve the display fields a preview row shows in both the mobile card stack
// and the desktop table - keeps the two layouts in lock-step.
function derivePreview(
  r: PreviewRow,
  accounts: Account[],
  categories: Category[],
  ann?: RowAnnotation,
) {
  const accountName = accounts.find((a) => a.id === r.accountId)?.name ?? '-'
  let categoryName = categories.find((c) => c.id === r.categoryId)?.name ?? 'Uncategorized'
  let categorySuggested = false
  if (!r.categoryId && ann?.suggestedCategoryId) {
    const n = categories.find((c) => c.id === ann.suggestedCategoryId)?.name
    if (n) {
      categoryName = n
      categorySuggested = true
    }
  }
  const amt = r.amountCents
  const isIncome = amt !== null && amt < 0
  return {
    accountName,
    categoryName,
    categorySuggested,
    amt,
    isIncome,
    matched: !!ann?.matchedTxId,
    matchedDate: ann?.matchedDate ?? null,
  }
}

// Status chip - the text label is the non-color cue, so the verdict survives
// in greyscale. A reconciled row ('Matches existing') enriches a transaction
// you already have instead of importing a duplicate.
function StatusChip({ error, matched }: { error?: string; matched?: boolean }) {
  if (error) {
    return (
      <span className="inline-block rounded-full bg-maple-soft px-2 py-0.5 text-[10.5px] font-semibold text-maple">
        {error}
      </span>
    )
  }
  if (matched) {
    return (
      <span className="inline-block rounded-full bg-cream-2 px-2 py-0.5 text-[10.5px] font-semibold text-ink-2">
        Matches existing
      </span>
    )
  }
  return (
    <span className="inline-block rounded-full bg-leaf-soft px-2 py-0.5 text-[10.5px] font-semibold text-leaf">
      New
    </span>
  )
}

function MetaPair({
  label,
  value,
  mono,
  muted,
}: {
  label: string
  value: string
  mono?: boolean
  muted?: boolean
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
        {label}
      </dt>
      <dd
        className={
          (mono ? 'tabular-nums ' : '') + (muted ? 'text-ink-3' : 'text-ink')
        }
      >
        {value}
      </dd>
    </div>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-hair bg-paper p-5 md:p-6">
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
    <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full bg-ink font-serif text-[12px] tabular-nums text-paper">
      {n}
    </span>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">
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
}: {
  children: React.ReactNode
  align?: 'left' | 'right'
  mono?: boolean
  muted?: boolean
}) {
  return (
    <td
      className={
        'px-4 py-2 ' +
        (mono ? 'tabular-nums ' : '') +
        (muted ? 'text-ink-3' : 'text-ink')
      }
      style={{ textAlign: align }}
    >
      {children}
    </td>
  )
}

function Dot({ className = '' }: { className?: string }) {
  return <span className={`inline-block h-[8px] w-[8px] rounded-full ${className}`} />
}
