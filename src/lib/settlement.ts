// Pure compute for "who owes whom". Given transactions + their shares and
// any recorded settlements, produce a per-ordered-pair balance: how much
// `from_member_id` still owes `to_member_id` after netting settlements.
//
// Sign conventions:
// - transaction.amount_cents > 0 → the payer (transaction.member_id) paid out
//   of their account; non-payer shares OWE the payer.
// - transaction.amount_cents < 0 → refund landed on the payer's account;
//   non-payer shares are REFUNDED by the payer (share amount becomes a
//   credit from payer to owee, reducing whatever the owee owed earlier).
// - Shares where share.member_id == transaction.member_id are ignored (a
//   payer can't owe themselves).
// - Transactions with no payer (transaction.member_id == null) are ignored
//   — a shared-account transaction has no one to settle with.
//
// Settlements are straightforward: from_member paid to_member; subtract
// that from the running "from owes to" balance.

export type TxnLite = {
  id: string
  amount_cents: number
  member_id: string | null // the payer
}

export type ShareLite = {
  transaction_id: string
  member_id: string // the owee
  amount_cents: number // always positive; sign is inherited from the parent txn
}

export type SettlementLite = {
  from_member_id: string
  to_member_id: string
  amount_cents: number
}

export type PairBalance = {
  from_member_id: string
  to_member_id: string
  owed_cents: number // gross shares this direction (after refunds)
  settled_cents: number // settlements this direction
  net_cents: number // owed - settled
}

/**
 * Build a per-ordered-pair map. Keys are `${from}>${to}` to keep lookup simple.
 * Pairs with net_cents == 0 are included if there's any activity (either side).
 */
export function computePairBalances({
  transactions,
  shares,
  settlements,
}: {
  transactions: TxnLite[]
  shares: ShareLite[]
  settlements: SettlementLite[]
}): Map<string, PairBalance> {
  const txById = new Map<string, TxnLite>()
  for (const t of transactions) txById.set(t.id, t)

  const out = new Map<string, PairBalance>()
  const key = (from: string, to: string) => `${from}>${to}`
  const ensure = (from: string, to: string): PairBalance => {
    const k = key(from, to)
    let pair = out.get(k)
    if (!pair) {
      pair = {
        from_member_id: from,
        to_member_id: to,
        owed_cents: 0,
        settled_cents: 0,
        net_cents: 0,
      }
      out.set(k, pair)
    }
    return pair
  }

  for (const s of shares) {
    const tx = txById.get(s.transaction_id)
    if (!tx || !tx.member_id) continue
    if (s.member_id === tx.member_id) continue // payer's own share, no debt
    // Positive txn: owee owes payer s.amount_cents.
    // Negative txn (refund): owee is refunded s.amount_cents (payer credits owee).
    const direction = Math.sign(tx.amount_cents) || 0
    if (direction === 0) continue
    if (direction > 0) {
      const pair = ensure(s.member_id, tx.member_id) // owee → payer
      pair.owed_cents += s.amount_cents
    } else {
      const pair = ensure(s.member_id, tx.member_id)
      pair.owed_cents -= s.amount_cents // reduces what owee owes payer
    }
  }

  for (const st of settlements) {
    const pair = ensure(st.from_member_id, st.to_member_id)
    pair.settled_cents += st.amount_cents
  }

  for (const pair of out.values()) {
    pair.net_cents = pair.owed_cents - pair.settled_cents
  }

  return out
}

/**
 * Given per-ordered-pair balances, net them into unique directional balances
 * so each unordered pair appears once. Positive net_cents means A owes B;
 * negative means B owes A (we swap the direction to keep positive). Returns
 * only pairs with |net| > 0.
 */
export type NetBalance = {
  from_member_id: string // the one who owes (after netting)
  to_member_id: string
  net_cents: number // always > 0 after netting
}

export function netUnorderedPairs(pairs: Map<string, PairBalance>): NetBalance[] {
  const seen = new Set<string>()
  const result: NetBalance[] = []

  for (const pair of pairs.values()) {
    const { from_member_id: a, to_member_id: b } = pair
    const unordered = [a, b].sort().join('|')
    if (seen.has(unordered)) continue
    seen.add(unordered)

    const ab = pair.net_cents
    const reverse = pairs.get(`${b}>${a}`)
    const ba = reverse?.net_cents ?? 0

    const net = ab - ba
    if (net === 0) continue
    if (net > 0) result.push({ from_member_id: a, to_member_id: b, net_cents: net })
    else result.push({ from_member_id: b, to_member_id: a, net_cents: -net })
  }

  return result
}

/**
 * Totals per transaction: how much of the transaction is currently shared
 * (sum of share amounts on this transaction). Useful for the /shared page
 * to show "flagged N transactions, $X total shared".
 */
export function totalSharedByTransaction(shares: ShareLite[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const s of shares) m.set(s.transaction_id, (m.get(s.transaction_id) ?? 0) + s.amount_cents)
  return m
}
