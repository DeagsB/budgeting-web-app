/**
 * Settlement detection: pure decisions, no I/O.
 *
 * A "candidate" is a ledger row that a settlement rule matched (an e-Transfer,
 * say) attributed to one member. Its direction is derived from the sign:
 * an outflow means the member PAID someone (they are the `from` side of a
 * settlement), an inflow means they RECEIVED (the `to` side).
 *
 * Decision order:
 *   1. link    - a settlement with the same pair + amount within a few days
 *                whose matching side is still empty (recorded by hand, by
 *                "Mark settled", or from the other member's ledger). Linking
 *                is what keeps the two ledgers from double-counting.
 *   2. record  - an outstanding line has this member on the right side and
 *                nets to exactly this amount: record it against that line's
 *                period.
 *   3. prompt  - anything else. Suggest a counterparty when it is unambiguous.
 */
import type { NetBalance } from '@/lib/settlement'

export type SettlementSide = 'from' | 'to'
export type SideColumn = 'paid_transaction_id' | 'received_transaction_id'

export type SettlementCandidate = {
  transaction_id: string
  member_id: string
  /** Signed cents as stored: > 0 outflow, < 0 inflow. */
  amount_cents: number
  occurred_on: string
}

/** An outstanding net line and where it lives. Pass awaiting-statement lines before open ones. */
export type OutstandingLine = NetBalance & { period_id: string | null }

export type LinkableSettlement = {
  id: string
  from_member_id: string
  to_member_id: string
  amount_cents: number
  settled_on: string
  paid_transaction_id: string | null
  received_transaction_id: string | null
}

export type SettlementMatch =
  | { kind: 'link'; settlement_id: string; column: SideColumn }
  | { kind: 'record'; from_member_id: string; to_member_id: string; period_id: string | null; column: SideColumn }
  | { kind: 'prompt'; side: SettlementSide; suggested_counterparty: string | null; column: SideColumn }

export const LINK_WINDOW_DAYS = 7

export function sideOf(amountCents: number): SettlementSide {
  return amountCents > 0 ? 'from' : 'to'
}

export function columnFor(side: SettlementSide): SideColumn {
  return side === 'from' ? 'paid_transaction_id' : 'received_transaction_id'
}

export function daysBetween(aISO: string, bISO: string): number {
  const a = Date.UTC(+aISO.slice(0, 4), +aISO.slice(5, 7) - 1, +aISO.slice(8, 10))
  const b = Date.UTC(+bISO.slice(0, 4), +bISO.slice(5, 7) - 1, +bISO.slice(8, 10))
  return Math.abs(Math.round((a - b) / 86_400_000))
}

/** Lines where `member` sits on `side`, in the order given. */
function linesFor(lines: OutstandingLine[], member: string, side: SettlementSide): OutstandingLine[] {
  return lines.filter((l) => (side === 'from' ? l.from_member_id : l.to_member_id) === member)
}

export function matchSettlement(
  c: SettlementCandidate,
  lines: OutstandingLine[],
  existing: LinkableSettlement[],
  otherActiveMembers: string[],
): SettlementMatch {
  const side = sideOf(c.amount_cents)
  const column = columnFor(side)
  const abs = Math.abs(c.amount_cents)
  if (abs === 0) return { kind: 'prompt', side, suggested_counterparty: null, column }

  // 1. Link to a settlement already on the books.
  const linkable = existing
    .filter((s) => (side === 'from' ? s.from_member_id : s.to_member_id) === c.member_id)
    .filter((s) => s.amount_cents === abs && s[column] === null)
    .filter((s) => daysBetween(s.settled_on, c.occurred_on) <= LINK_WINDOW_DAYS)
    .sort((a, b) => daysBetween(a.settled_on, c.occurred_on) - daysBetween(b.settled_on, c.occurred_on))
  if (linkable[0]) return { kind: 'link', settlement_id: linkable[0].id, column }

  // 2. Exact match against an outstanding line (caller orders awaiting first).
  const mine = linesFor(lines, c.member_id, side)
  const exact = mine.find((l) => l.net_cents === abs)
  if (exact) {
    return { kind: 'record', from_member_id: exact.from_member_id, to_member_id: exact.to_member_id, period_id: exact.period_id, column }
  }

  // 3. Prompt, with a suggestion when there is only one sensible answer.
  const counterparties = new Set(mine.map((l) => (side === 'from' ? l.to_member_id : l.from_member_id)))
  let suggested: string | null = null
  if (counterparties.size === 1) suggested = [...counterparties][0]
  else if (counterparties.size === 0 && otherActiveMembers.length === 1) suggested = otherActiveMembers[0]
  return { kind: 'prompt', side, suggested_counterparty: suggested, column }
}

/** The pair a confirmed candidate settles, given the chosen counterparty. */
export function pairFor(c: SettlementCandidate, counterparty: string): { from_member_id: string; to_member_id: string } {
  return sideOf(c.amount_cents) === 'from'
    ? { from_member_id: c.member_id, to_member_id: counterparty }
    : { from_member_id: counterparty, to_member_id: c.member_id }
}
