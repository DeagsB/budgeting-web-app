import { transferKind, type TransferKind } from '@/lib/transfer-match'

/**
 * How a transfer leg reads on a row. Pure, so the label rules are testable
 * and the transactions page and any future surface say the same thing.
 *
 *   Card payment to Visa      (out leg, money landed on a credit card)
 *   Card payment from Chequing (in leg on the card)
 *   Loan payment to Car loan
 *   Transfer to Savings / Transfer from Chequing
 *   Transfer                  (counterpart account not visible to this login)
 */

export type TransferMeta = {
  kind: TransferKind
  /** The pill text: Transfer / Card payment / Loan payment. */
  noun: string
  /** The meta-line text, with the counterpart when it can be named. */
  label: string
}

export function transferNoun(kind: TransferKind): string {
  return kind === 'card_payment' ? 'Card payment' : kind === 'loan_payment' ? 'Loan payment' : 'Transfer'
}

export function transferMeta(input: {
  side: 'out' | 'in'
  counterpartName: string | null
  /** Type of the account the money landed on (the in leg's account). */
  inAccountType: string | null
}): TransferMeta {
  const kind = transferKind(input.inAccountType)
  const noun = transferNoun(kind)
  if (!input.counterpartName) return { kind, noun, label: noun }
  return { kind, noun, label: `${noun} ${input.side === 'out' ? 'to' : 'from'} ${input.counterpartName}` }
}
