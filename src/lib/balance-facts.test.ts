import { describe, expect, it } from 'vitest'
import {
  accountBalanceAt,
  groupSnapsByAccount,
  groupTxByAccount,
  netWorthTrail,
  type BalanceAccount,
  type BalanceSnapshot,
  type BalanceTx,
} from './balances'
import { factsFromTx, factsToBalanceTx } from './balance-facts'

// Deterministic pseudo-random generator so failures reproduce.
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const MONTHS = [
  '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01',
  '2026-07-01', '2026-08-01',
]

function randomWorld(seed: number) {
  const rand = rng(seed)
  const accounts: BalanceAccount[] = [
    { id: 'chq', type: 'chequing', opening_balance_cents: 250_000 },
    { id: 'visa', type: 'credit_card', opening_balance_cents: 40_000 },
    { id: 'sav', type: 'savings', opening_balance_cents: 1_000_000 },
  ]
  const txs: BalanceTx[] = []
  for (const m of MONTHS) {
    for (const a of accounts) {
      const n = Math.floor(rand() * 8)
      for (let i = 0; i < n; i++) {
        // Bias towards day 1 and month ends - the boundary cases.
        const day = rand() < 0.3 ? 1 : 1 + Math.floor(rand() * 28)
        txs.push({
          account_id: a.id,
          occurred_on: `${m.slice(0, 7)}-${String(day).padStart(2, '0')}`,
          amount_cents: Math.round((rand() - 0.45) * 40_000),
        })
      }
    }
  }
  const snaps: BalanceSnapshot[] = []
  for (const a of accounts) {
    for (const m of MONTHS) {
      if (rand() < 0.25) {
        snaps.push({ account_id: a.id, as_of_month: m, balance_cents: Math.round(rand() * 500_000) })
      }
    }
  }
  return { accounts, txs, snaps }
}

describe('factsToBalanceTx parity with raw transactions', () => {
  it('reproduces balances and the net-worth trail exactly, snapshots included', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const { accounts, txs, snaps } = randomWorld(seed)
      const upTo = '2026-09-01'
      const rawTx = groupTxByAccount(txs.filter((t) => t.occurred_on < upTo))
      const factTx = groupTxByAccount(factsToBalanceTx(factsFromTx(txs, upTo)))
      const snapMap = groupSnapsByAccount(snaps)

      for (const a of accounts) {
        for (const m of MONTHS) {
          expect(
            accountBalanceAt(a, m, factTx, snapMap),
            `seed ${seed} account ${a.id} month ${m}`,
          ).toBe(accountBalanceAt(a, m, rawTx, snapMap))
        }
      }
      expect(netWorthTrail(accounts, MONTHS, factTx, snapMap)).toEqual(
        netWorthTrail(accounts, MONTHS, rawTx, snapMap),
      )
    }
  })

  it('drops transactions on/after the cutoff, like the SQL where-clause', () => {
    const facts = factsFromTx(
      [
        { account_id: 'a', occurred_on: '2026-08-30', amount_cents: 100 },
        { account_id: 'a', occurred_on: '2026-09-01', amount_cents: 999 },
      ],
      '2026-09-01',
    )
    expect(facts).toHaveLength(1)
    expect(facts[0].net_cents).toBe(100)
  })
})
