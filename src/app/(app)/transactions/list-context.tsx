'use client'

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { RuleSheetMember } from '@/app/(app)/rules/rule-sheet'

export type ListAccount = { id: string; name: string }
export type ListCategory = { id: string; parent_id: string | null; name: string }

type TransactionListData = {
  accounts: ListAccount[]
  categories: ListCategory[]
  memberWeights: RuleSheetMember[]
  topCategoryIds: string[]
  /** categories indexed by id - built once here instead of once per row. */
  categoryById: Map<string, ListCategory>
}

const TransactionListContext = createContext<TransactionListData | null>(null)

/**
 * Shared reference data for every transaction row. Before this existed the
 * server list serialized the full accounts/categories/member arrays into the
 * RSC payload once per row (hundreds of copies in a busy month) and each row
 * rebuilt its own category Map. Provided once above the list; rows read it
 * with useTransactionList().
 */
export function TransactionListProvider({
  accounts,
  categories,
  memberWeights,
  topCategoryIds,
  children,
}: Omit<TransactionListData, 'categoryById'> & { children: ReactNode }) {
  const value = useMemo(
    () => ({
      accounts,
      categories,
      memberWeights,
      topCategoryIds,
      categoryById: new Map(categories.map((c) => [c.id, c])),
    }),
    [accounts, categories, memberWeights, topCategoryIds],
  )
  return <TransactionListContext.Provider value={value}>{children}</TransactionListContext.Provider>
}

export function useTransactionList(): TransactionListData {
  const ctx = useContext(TransactionListContext)
  if (!ctx) throw new Error('useTransactionList must be used inside <TransactionListProvider>')
  return ctx
}
