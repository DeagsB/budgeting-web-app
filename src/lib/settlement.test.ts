import { describe, expect, it } from 'vitest'
import {
  closeDateForMonth,
  computeBalancesByPeriod,
  computePairBalances,
  computePeriodStatement,
  netUnorderedPairs,
  nextAutoCloseDate,
  settlementBucket,
  shareBucket,
  shouldAutoClose,
  type PeriodLite,
  type SettlementWithPeriod,
  type ShareWithPeriod,
  type TxnLite,
} from './settlement'

const A = 'a',
  B = 'b'

const periods: PeriodLite[] = [
  { id: 'p1', period_start: '2026-06-01', period_end: '2026-06-28', status: 'settled' },
  { id: 'p2', period_start: '2026-06-29', period_end: '2026-07-28', status: 'closed' },
  { id: 'open', period_start: '2026-07-29', period_end: null, status: 'open' },
]

const txns: TxnLite[] = [
  { id: 't1', amount_cents: 10000, member_id: A }, // A paid, B owes share
  { id: 't2', amount_cents: 6000, member_id: B }, // B paid, A owes share
  { id: 't3', amount_cents: 4000, member_id: A },
  { id: 't4', amount_cents: -2000, member_id: A }, // refund
]

const shares: ShareWithPeriod[] = [
  { transaction_id: 't1', member_id: B, amount_cents: 5000, settlement_period_id: 'p1' },
  { transaction_id: 't2', member_id: A, amount_cents: 3000, settlement_period_id: 'p2' },
  { transaction_id: 't3', member_id: B, amount_cents: 2000, settlement_period_id: null },
  { transaction_id: 't4', member_id: B, amount_cents: 1000, settlement_period_id: null },
]

const settlements: SettlementWithPeriod[] = [
  { from_member_id: B, to_member_id: A, amount_cents: 5000, period_id: 'p1', settled_on: '2026-06-29' },
  { from_member_id: A, to_member_id: B, amount_cents: 1000, period_id: null, settled_on: '2026-07-10' }, // legacy → p2 by date
]

describe('buckets', () => {
  it('shares go to their stamp or the open period', () => {
    expect(shareBucket(shares[0], 'open')).toBe('p1')
    expect(shareBucket(shares[2], 'open')).toBe('open')
  })
  it('settlements go to period_id, else date range of a closed period, else open', () => {
    expect(settlementBucket(settlements[0], periods, 'open')).toBe('p1')
    expect(settlementBucket(settlements[1], periods, 'open')).toBe('p2')
    expect(settlementBucket({ ...settlements[1], settled_on: '2026-08-01' }, periods, 'open')).toBe('open')
  })
})

describe('computePeriodStatement', () => {
  const byPeriod = computeBalancesByPeriod({ periods, transactions: txns, shares, settlements })

  it('settled period nets to zero', () => {
    const s = computePeriodStatement('p1', byPeriod, periods)
    expect(s.lines).toEqual([])
    expect(s.totalOwedCents).toBe(5000)
    expect(s.totalSettledCents).toBe(5000)
  })

  it('closed period shows its live remainder', () => {
    const s = computePeriodStatement('p2', byPeriod, periods)
    expect(s.lines).toEqual([{ from_member_id: A, to_member_id: B, net_cents: 2000 }])
  })

  it('open period = own shares + carry-forward, and matches the global net', () => {
    const s = computePeriodStatement('open', byPeriod, periods)
    // own: B owes A 2000 - refund 1000 = 1000; carry: A owes B 2000 → net A owes B 1000
    expect(s.carryForward).toEqual([{ from_member_id: A, to_member_id: B, net_cents: 2000 }])
    expect(s.lines).toEqual([{ from_member_id: A, to_member_id: B, net_cents: 1000 }])

    const global = netUnorderedPairs(
      computePairBalances({ transactions: txns, shares, settlements }),
    )
    expect(s.lines).toEqual(global)
  })

  it('invariant: Σ open lines == global net for random fixtures', () => {
    let seed = 7
    const rnd = () => (seed = (seed * 48271) % 2147483647) / 2147483647
    for (let round = 0; round < 40; round++) {
      const ps: PeriodLite[] = [
        { id: 'c1', period_start: '2026-01-01', period_end: '2026-01-28', status: 'closed' },
        { id: 'c2', period_start: '2026-01-29', period_end: '2026-02-28', status: 'closed' },
        { id: 'o', period_start: '2026-03-01', period_end: null, status: 'open' },
      ]
      const ts: TxnLite[] = []
      const sh: ShareWithPeriod[] = []
      const st: SettlementWithPeriod[] = []
      for (let i = 0; i < 12; i++) {
        const payer = rnd() < 0.5 ? A : B
        const amt = Math.floor(rnd() * 20000) - 4000
        ts.push({ id: `t${i}`, amount_cents: amt, member_id: payer })
        const stamp = rnd() < 0.3 ? null : rnd() < 0.5 ? 'c1' : 'c2'
        sh.push({ transaction_id: `t${i}`, member_id: payer === A ? B : A, amount_cents: Math.floor(Math.abs(amt) / 2), settlement_period_id: stamp })
      }
      for (let i = 0; i < 4; i++) {
        const from = rnd() < 0.5 ? A : B
        st.push({ from_member_id: from, to_member_id: from === A ? B : A, amount_cents: Math.floor(rnd() * 5000) + 1, period_id: rnd() < 0.5 ? 'c1' : null, settled_on: rnd() < 0.5 ? '2026-02-10' : '2026-03-10' })
      }
      const bp = computeBalancesByPeriod({ periods: ps, transactions: ts, shares: sh, settlements: st })
      const open = computePeriodStatement('o', bp, ps)
      const global = netUnorderedPairs(computePairBalances({ transactions: ts, shares: sh, settlements: st }))
      expect(open.lines).toEqual(global)
    }
  })

  it('editing a stamped share moves the open balance by exactly the delta', () => {
    const before = computePeriodStatement('open', computeBalancesByPeriod({ periods, transactions: txns, shares, settlements }), periods)
    const edited = shares.map((s) => (s.transaction_id === 't2' ? { ...s, amount_cents: 3500 } : s))
    const after = computePeriodStatement('open', computeBalancesByPeriod({ periods, transactions: txns, shares: edited, settlements }), periods)
    expect(after.totalNetCents - before.totalNetCents).toBe(500)
  })
})

describe('close-day math', () => {
  it('closeDateForMonth clamps 1..28', () => {
    expect(closeDateForMonth('2026-08-26', 28)).toBe('2026-08-28')
    expect(closeDateForMonth('2026-02-03', 31)).toBe('2026-02-28')
    expect(closeDateForMonth('2026-02-03', 0)).toBe('2026-02-01')
  })

  it('shouldAutoClose: before day → no; on/after → yes; already closed this month → no', () => {
    expect(shouldAutoClose({ todayISO: '2026-08-27', closeDay: 28, lastClosedAtISO: null })).toBe(false)
    expect(shouldAutoClose({ todayISO: '2026-08-28', closeDay: 28, lastClosedAtISO: null })).toBe(true)
    expect(shouldAutoClose({ todayISO: '2026-08-30', closeDay: 28, lastClosedAtISO: '2026-07-28' })).toBe(true)
    expect(shouldAutoClose({ todayISO: '2026-08-30', closeDay: 28, lastClosedAtISO: '2026-08-20' })).toBe(false)
  })

  it('close early then cron: Aug 20 manual → Aug 28 no-op → Sep 28 closes', () => {
    expect(shouldAutoClose({ todayISO: '2026-08-28', closeDay: 28, lastClosedAtISO: '2026-08-20' })).toBe(false)
    expect(shouldAutoClose({ todayISO: '2026-09-28', closeDay: 28, lastClosedAtISO: '2026-08-20' })).toBe(true)
  })

  it('nextAutoCloseDate', () => {
    expect(nextAutoCloseDate('2026-08-10', 28, null)).toBe('2026-08-28')
    expect(nextAutoCloseDate('2026-08-29', 28, '2026-08-28')).toBe('2026-09-28')
    expect(nextAutoCloseDate('2026-08-21', 28, '2026-08-20')).toBe('2026-09-28')
    expect(nextAutoCloseDate('2026-12-30', 28, '2026-12-28')).toBe('2027-01-28')
  })
})
