import { describe, expect, it } from 'vitest'
import { equalWeights, splitByWeights, weightsToPercents } from './share-split'

const A = 'a',
  B = 'b',
  C = 'c'

describe('splitByWeights', () => {
  it('two-way equal with payer: owee gets half, payer row dropped', () => {
    expect(splitByWeights(1000, A, equalWeights([A, B]))).toEqual([{ member_id: B, amount_cents: 500 }])
  })

  it('odd cent goes to the largest fractional part, deterministically', () => {
    // 1001 / 2 = 500.5 each; tie → earlier input order (A) gets the extra cent.
    expect(splitByWeights(1001, B, equalWeights([A, B]))).toEqual([{ member_id: A, amount_cents: 501 }])
    expect(splitByWeights(1001, A, equalWeights([A, B]))).toEqual([{ member_id: B, amount_cents: 500 }])
  })

  it('three-way equal on 100 cents sums to total with payer null', () => {
    const rows = splitByWeights(100, null, equalWeights([A, B, C]))
    expect(rows.reduce((s, r) => s + r.amount_cents, 0)).toBe(100)
    expect(rows.map((r) => r.amount_cents)).toEqual([34, 33, 33])
  })

  it('weights 3/2/1 (60/40 style) with payer A on $100', () => {
    const rows = splitByWeights(10000, A, [
      { id: A, weight: 3 },
      { id: B, weight: 2 },
      { id: C, weight: 1 },
    ])
    expect(rows).toEqual([
      { member_id: B, amount_cents: 3333 },
      { member_id: C, amount_cents: 1667 },
    ])
  })

  it('payer with weight 0 means the others split everything', () => {
    expect(
      splitByWeights(1000, A, [
        { id: A, weight: 0 },
        { id: B, weight: 1 },
        { id: C, weight: 1 },
      ]),
    ).toEqual([
      { member_id: B, amount_cents: 500 },
      { member_id: C, amount_cents: 500 },
    ])
  })

  it('payer not in list: everyone owes', () => {
    const rows = splitByWeights(900, 'zz', equalWeights([A, B, C]))
    expect(rows.reduce((s, r) => s + r.amount_cents, 0)).toBe(900)
  })

  it('zero total / bad input / no participants → []', () => {
    expect(splitByWeights(0, A, equalWeights([A, B]))).toEqual([])
    expect(splitByWeights(-5, A, equalWeights([A, B]))).toEqual([])
    expect(splitByWeights(10.5, A, equalWeights([A, B]))).toEqual([])
    expect(splitByWeights(100, A, [])).toEqual([])
    expect(splitByWeights(100, A, [{ id: A, weight: 1 }])).toEqual([])
  })

  it('duplicates are ignored', () => {
    expect(splitByWeights(100, A, equalWeights([A, B, B]))).toEqual([{ member_id: B, amount_cents: 50 }])
  })

  it('invariants hold across many totals and member counts', () => {
    for (let n = 2; n <= 7; n++) {
      const members = Array.from({ length: n }, (_, i) => ({ id: `m${i}`, weight: 1 + (i % 3) }))
      const W = members.reduce((s, m) => s + m.weight, 0)
      for (let total = 1; total <= 400; total += 7) {
        const all = splitByWeights(total, null, members)
        const sum = all.reduce((s, r) => s + r.amount_cents, 0)
        expect(sum).toBe(total)
        for (const r of all) {
          const exact = (total * members.find((m) => m.id === r.member_id)!.weight) / W
          expect(Math.abs(r.amount_cents - exact)).toBeLessThan(1)
        }
        const withPayer = splitByWeights(total, 'm0', members)
        expect(withPayer.reduce((s, r) => s + r.amount_cents, 0)).toBeLessThanOrEqual(total)
        expect(withPayer.find((r) => r.member_id === 'm0')).toBeUndefined()
      }
    }
  })
})

describe('weightsToPercents', () => {
  it('derives percents, zero-weight members get 0', () => {
    const p = weightsToPercents([
      { id: A, weight: 3 },
      { id: B, weight: 2 },
      { id: C, weight: 0 },
    ])
    expect(p.get(A)).toBe(60)
    expect(p.get(B)).toBe(40)
    expect(p.get(C)).toBe(0)
  })
})
