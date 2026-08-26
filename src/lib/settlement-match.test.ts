import { describe, expect, it } from 'vitest'
import { daysBetween, matchSettlement, pairFor, sideOf, type LinkableSettlement, type OutstandingLine } from './settlement-match'

const A = 'a'
const B = 'b'
const C = 'c'
const line = (from: string, to: string, net: number, period_id: string | null = 'open'): OutstandingLine => ({
  from_member_id: from,
  to_member_id: to,
  net_cents: net,
  period_id,
})
const sett = (over: Partial<LinkableSettlement>): LinkableSettlement => ({
  id: 's1',
  from_member_id: A,
  to_member_id: B,
  amount_cents: 6000,
  settled_on: '2026-08-20',
  paid_transaction_id: null,
  received_transaction_id: null,
  ...over,
})

describe('sideOf / daysBetween', () => {
  it('outflow pays, inflow receives', () => {
    expect(sideOf(100)).toBe('from')
    expect(sideOf(-100)).toBe('to')
  })
  it('days are absolute and calendar based', () => {
    expect(daysBetween('2026-08-20', '2026-08-27')).toBe(7)
    expect(daysBetween('2026-08-27', '2026-08-20')).toBe(7)
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1)
  })
})

describe('matchSettlement', () => {
  const paid = { transaction_id: 't1', member_id: A, amount_cents: 6000, occurred_on: '2026-08-22' }
  const received = { transaction_id: 't2', member_id: B, amount_cents: -6000, occurred_on: '2026-08-23' }

  it('links the payer side to a hand-recorded settlement within the window', () => {
    const r = matchSettlement(paid, [], [sett({})], [B])
    expect(r).toEqual({ kind: 'link', settlement_id: 's1', column: 'paid_transaction_id' })
  })

  it('links the recipient side to the same settlement once the payer side is taken', () => {
    const r = matchSettlement(received, [], [sett({ paid_transaction_id: 't1' })], [A])
    expect(r).toEqual({ kind: 'link', settlement_id: 's1', column: 'received_transaction_id' })
  })

  it('does not link when that side is taken, outside the window, or the amount differs', () => {
    expect(matchSettlement(paid, [], [sett({ paid_transaction_id: 'x' })], [B]).kind).not.toBe('link')
    expect(matchSettlement(paid, [], [sett({ settled_on: '2026-08-01' })], [B]).kind).not.toBe('link')
    expect(matchSettlement(paid, [], [sett({ amount_cents: 5999 })], [B]).kind).not.toBe('link')
  })

  it('prefers the closest-dated linkable settlement', () => {
    const r = matchSettlement(paid, [], [sett({ id: 'far', settled_on: '2026-08-16' }), sett({ id: 'near', settled_on: '2026-08-21' })], [B])
    expect(r).toMatchObject({ kind: 'link', settlement_id: 'near' })
  })

  it('records against the first exact line, awaiting statements before open', () => {
    const r = matchSettlement(paid, [line(A, B, 6000, 'closed-1'), line(A, B, 6000, 'open')], [], [B])
    expect(r).toEqual({ kind: 'record', from_member_id: A, to_member_id: B, period_id: 'closed-1', column: 'paid_transaction_id' })
  })

  it('an inflow records with the member on the receiving side', () => {
    const r = matchSettlement(received, [line(A, B, 6000)], [], [A])
    expect(r).toMatchObject({ kind: 'record', from_member_id: A, to_member_id: B, column: 'received_transaction_id' })
  })

  it('ignores lines where the member is on the wrong side', () => {
    expect(matchSettlement(paid, [line(B, A, 6000)], [], [B]).kind).toBe('prompt')
  })

  it('prompts with the single counterparty from the lines', () => {
    const r = matchSettlement(paid, [line(A, B, 1234)], [], [B, C])
    expect(r).toEqual({ kind: 'prompt', side: 'from', suggested_counterparty: B, column: 'paid_transaction_id' })
  })

  it('prompts with the only other member when there are no lines', () => {
    expect(matchSettlement(paid, [], [], [B])).toMatchObject({ kind: 'prompt', suggested_counterparty: B })
    expect(matchSettlement(paid, [], [], [B, C])).toMatchObject({ kind: 'prompt', suggested_counterparty: null })
  })

  it('prompts without a suggestion when the lines name two counterparties', () => {
    const r = matchSettlement(paid, [line(A, B, 100), line(A, C, 200)], [], [B, C])
    expect(r).toMatchObject({ kind: 'prompt', suggested_counterparty: null })
  })

  it('a zero-amount row is only ever a prompt', () => {
    expect(matchSettlement({ ...paid, amount_cents: 0 }, [], [sett({ amount_cents: 0 })], [B]).kind).toBe('prompt')
  })
})

describe('pairFor', () => {
  it('orients the pair by the candidate side', () => {
    expect(pairFor({ transaction_id: 't', member_id: A, amount_cents: 10, occurred_on: '2026-01-01' }, B)).toEqual({ from_member_id: A, to_member_id: B })
    expect(pairFor({ transaction_id: 't', member_id: A, amount_cents: -10, occurred_on: '2026-01-01' }, B)).toEqual({ from_member_id: B, to_member_id: A })
  })
})
