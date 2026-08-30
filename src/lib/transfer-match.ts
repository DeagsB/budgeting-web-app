/**
 * Transfer detection: pure decisions, no I/O.
 *
 * A transfer is money moving between two of the household's own accounts. It
 * shows up as two ledger rows: an outflow (+X) on one account and an inflow
 * (-X) on another, usually within a few days. Pairing them lets every
 * income / expense figure skip both legs (the card's purchases are already
 * the expense; the payment is not a second one) while balances still move.
 *
 * Pair rule: different account, exactly opposite amount, within a window,
 * neither leg already paired / settlement evidence / "Not a transfer".
 *
 *   window  - 7 days when either leg carries a transfer signal (Plaid's own
 *             TRANSFER_* / LOAN_PAYMENTS category, a description keyword, or
 *             the inflow lands on a card / loan), 3 days when neither does,
 *             so a CSV / manual row with no signal cannot pair with an
 *             equal-and-opposite coincidence a week away.
 *   veto    - both legs carry a Plaid category and neither is transfer-like:
 *             both banks say "purchase" / "income", so it is a coincidence.
 *   settle  - a row a settlement rule matches (an e-Transfer) is never paired
 *             with a leg on a DIFFERENT member's personal account; the
 *             settlement path owns member -> member payments. Same owner, or
 *             a joint account on either side, is a transfer.
 *
 * Greedy, one claim per row, deterministic: candidates in (date, id) order,
 * options ranked by how well each leg's own hint names the other's account,
 * then date distance, then the option's own signal, then asset -> liability
 * shape, then id. Non-candidate pool rows can be claimed but never initiate,
 * so a backfill or a re-detect only ever pairs what it was asked about.
 */
import { INVESTMENT_TYPES, LIABILITY_TYPES, type AccountType } from '@/lib/domain'
import { normalizeMerchant } from '@/lib/statement-reconcile'

export const TRANSFER_WINDOW_DAYS = 7
export const BARE_WINDOW_DAYS = 3

export type TransferAccount = {
  id: string
  type: string
  ownership: 'member' | 'shared'
  member_id: string | null
}

export type TransferRow = {
  id: string
  account_id: string
  /** Signed cents as stored: > 0 outflow, < 0 inflow. */
  amount_cents: number
  occurred_on: string
  transfer_ignored: boolean
  /** Already a transfer leg or settlement evidence: never pairs. */
  linked: boolean
  /** A settlement rule matches this row (see settlement precedence above). */
  settlementCandidate: boolean
  pfc_primary: string | null
  pfc_detailed: string | null
  description: string | null
}

export type TransferPair = { out_transaction_id: string; in_transaction_id: string }
export type TransferKind = 'transfer' | 'card_payment' | 'loan_payment'
export type TransferHint = 'credit_card' | 'loan' | 'savings' | 'investment'

/** Plaid's own word for it. Prefix-based so a taxonomy revision cannot silently turn it off. */
export function isTransferishPfc(primary: string | null, detailed: string | null): boolean {
  if (primary && /^(TRANSFER_IN|TRANSFER_OUT|LOAN_PAYMENTS)/.test(primary)) return true
  if (detailed && /(TRANSFER|LOAN_PAYMENTS)/.test(detailed)) return true
  return false
}

/** Both banks classified the row and neither called it a transfer: a coincidence, not a pair. */
export function pfcVeto(
  a: Pick<TransferRow, 'pfc_primary' | 'pfc_detailed'>,
  b: Pick<TransferRow, 'pfc_primary' | 'pfc_detailed'>,
): boolean {
  if (!a.pfc_primary || !b.pfc_primary) return false
  return !isTransferishPfc(a.pfc_primary, a.pfc_detailed) && !isTransferishPfc(b.pfc_primary, b.pfc_detailed)
}

const KEYWORD = /\b(TRANSFER|TFR|PAYMENT|PYMT|THANK YOU|INTERNET BANKING|ONLINE BANKING)\b/

/** A bank descriptor that usually means "moved, not spent". Boost only; never a hard rule. */
export function hasTransferKeyword(description: string | null | undefined): boolean {
  return KEYWORD.test(normalizeMerchant(description))
}

const HINT_CREDIT_CARD = /\b(VISA|MASTERCARD|AMEX|CREDIT CARD)\b/
const HINT_LOAN = /\b(LOAN|MORTGAGE|LOC|LINE OF CREDIT)\b/
const HINT_SAVINGS = /\b(SAVINGS|SAV)\b/
const HINT_INVESTMENT = /\b(TFSA|RRSP|FHSA)\b/

/** What this leg says about the account on the OTHER side, if anything. */
export function hintFor(row: Pick<TransferRow, 'pfc_detailed' | 'description'>): TransferHint | null {
  const d = row.pfc_detailed ?? ''
  if (d === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT') return 'credit_card'
  if (d.startsWith('LOAN_PAYMENTS_')) return 'loan'
  if (/_SAVINGS$/.test(d)) return 'savings'
  if (/_INVESTMENT_AND_RETIREMENT_FUNDS$/.test(d)) return 'investment'
  const text = normalizeMerchant(row.description)
  if (!text) return null
  if (HINT_CREDIT_CARD.test(text)) return 'credit_card'
  if (HINT_LOAN.test(text)) return 'loan'
  if (HINT_INVESTMENT.test(text)) return 'investment'
  if (HINT_SAVINGS.test(text)) return 'savings'
  return null
}

export function hintMatches(hint: TransferHint | null, accountType: string): boolean {
  switch (hint) {
    case 'credit_card':
      return accountType === 'credit_card'
    case 'loan':
      return accountType === 'loan'
    case 'savings':
      return accountType === 'savings'
    case 'investment':
      return INVESTMENT_TYPES.has(accountType as AccountType)
    default:
      return false
  }
}

/** The member a personal account belongs to; null for a joint account. */
export function legOwner(acct: TransferAccount): string | null {
  return acct.ownership === 'member' ? acct.member_id : null
}

/** How the pair reads on the row, keyed on where the money landed. */
export function transferKind(inAccountType: string | null | undefined): TransferKind {
  if (inAccountType === 'credit_card') return 'card_payment'
  if (inAccountType === 'loan') return 'loan_payment'
  return 'transfer'
}

function toDayNumber(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return NaN
  return Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000)
}

/** Absolute calendar-day distance; NaN when either date is malformed (never pairs). */
export function dayDiff(a: string, b: string): number {
  return Math.abs(toDayNumber(a) - toDayNumber(b))
}

function isLiability(type: string): boolean {
  return LIABILITY_TYPES.has(type as AccountType)
}

function rowSignal(row: TransferRow): boolean {
  return isTransferishPfc(row.pfc_primary, row.pfc_detailed) || hasTransferKeyword(row.description)
}

type Option = { row: TransferRow; hint: number; days: number; ownSignal: number; shape: number }

export function matchTransfers(input: {
  candidateIds: ReadonlySet<string>
  pool: TransferRow[]
  accounts: ReadonlyMap<string, TransferAccount>
}): { pairs: TransferPair[] } {
  const { candidateIds, pool, accounts } = input

  const eligible = pool.filter(
    (r) =>
      r.amount_cents !== 0 &&
      !r.transfer_ignored &&
      !r.linked &&
      accounts.has(r.account_id) &&
      Number.isFinite(toDayNumber(r.occurred_on)),
  )

  const byAbs = new Map<number, TransferRow[]>()
  for (const r of eligible) {
    const key = Math.abs(r.amount_cents)
    const list = byAbs.get(key)
    if (list) list.push(r)
    else byAbs.set(key, [r])
  }

  const candidates = eligible
    .filter((r) => candidateIds.has(r.id))
    .sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || a.id.localeCompare(b.id))

  const used = new Set<string>()
  const pairs: TransferPair[] = []

  for (const c of candidates) {
    if (used.has(c.id)) continue
    const cAcct = accounts.get(c.account_id)!
    const cOwner = legOwner(cAcct)
    const cHint = hintFor(c)
    const cSignal = rowSignal(c)

    const options: Option[] = []
    for (const o of byAbs.get(Math.abs(c.amount_cents)) ?? []) {
      if (o.id === c.id || used.has(o.id)) continue
      if (o.amount_cents !== -c.amount_cents) continue
      if (o.account_id === c.account_id) continue
      const oAcct = accounts.get(o.account_id)!
      if (pfcVeto(c, o)) continue

      // Settlement precedence: member -> member money with a settlement rule
      // in play belongs to the settlement path, not here.
      const oOwner = legOwner(oAcct)
      if ((c.settlementCandidate || o.settlementCandidate) && cOwner && oOwner && cOwner !== oOwner) continue

      const inAcct = c.amount_cents > 0 ? oAcct : cAcct
      const outAcct = c.amount_cents > 0 ? cAcct : oAcct
      const oSignal = rowSignal(o)
      const signal = cSignal || oSignal || isLiability(inAcct.type)
      const days = dayDiff(c.occurred_on, o.occurred_on)
      if (!(days <= (signal ? TRANSFER_WINDOW_DAYS : BARE_WINDOW_DAYS))) continue

      const hint = (hintMatches(cHint, oAcct.type) ? 1 : 0) + (hintMatches(hintFor(o), cAcct.type) ? 1 : 0)
      const shape = !isLiability(outAcct.type) && isLiability(inAcct.type) ? 1 : 0
      options.push({ row: o, hint, days, ownSignal: oSignal ? 1 : 0, shape })
    }

    options.sort(
      (x, y) =>
        y.hint - x.hint ||
        x.days - y.days ||
        y.ownSignal - x.ownSignal ||
        y.shape - x.shape ||
        x.row.id.localeCompare(y.row.id),
    )
    const best = options[0]
    if (!best) continue

    used.add(c.id)
    used.add(best.row.id)
    pairs.push(
      c.amount_cents > 0
        ? { out_transaction_id: c.id, in_transaction_id: best.row.id }
        : { out_transaction_id: best.row.id, in_transaction_id: c.id },
    )
  }

  return { pairs }
}
