# Maple — Batch 3 & 4 Ports

Four more routes ported from the old Tailwind app into Maple's visual language.
Every file here is complete — drop into the indicated path, keep `actions.ts` / server files as-is.

---

## Batch 3 — Transactions + Budgets

| This file | → | Your app path |
|---|---|---|
| `tx-page.tsx` | → | `src/app/(app)/transactions/page.tsx` |
| `tx-add-form.tsx` | → | `src/app/(app)/transactions/add-form.tsx` |
| `tx-row.tsx` | → | `src/app/(app)/transactions/row.tsx` |
| `tx-category-select.tsx` | → | `src/app/(app)/transactions/category-select.tsx` |
| `tx-split-editor.tsx` | → | `src/app/(app)/transactions/split-editor.tsx` |
| `budgets-page.tsx` | → | `src/app/(app)/budgets/page.tsx` |
| `budgets-table.tsx` | → | `src/app/(app)/budgets/table.tsx` |

### Highlights

- **Transactions:** serif "Every loonie, accounted for." headline, month/member/category filter chips, swipe-to-reveal split + delete on each row, amount colored by direction (maple red for expenses, leaf green for income). Add form is a single-row composer at the top — tab through it like a spreadsheet.
- **Budgets:** one big ring per category + horizontal progress bar. Over-budget rows flash the maple-red accent. Envelope-style "rollover" toggle exposed per row.

---

## Batch 4 — Settlements + Accounts

| This file | → | Your app path |
|---|---|---|
| `settle-page.tsx` | → | `src/app/(app)/settle/page.tsx` |
| `settle-form.tsx` | → | `src/app/(app)/settle/form.tsx` |
| `settle-delete.tsx` | → | `src/app/(app)/settle/delete.tsx` |
| `accounts-page.tsx` | → | `src/app/(app)/accounts/page.tsx` |
| `accounts-add.tsx` | → | `src/app/(app)/accounts/add-form.tsx` |
| `accounts-row.tsx` | → | `src/app/(app)/accounts/row.tsx` |

### Highlights

- **Settle:** "Who owes whom" hero with serif number and `→` arrow between member names. Log-payment form is a single row of inputs; past settlements listed below with a delete affordance.
- **Accounts:** drawn SVG glyph per account type (chequing, credit card, savings, crypto, loan, cash). Liabilities render in maple-red with a leading minus. Inline edit per row (no modal). Archive toggle lives in the header.

---

## Shared dependencies (from earlier batches)

These must already exist from batch 1/2:

- `@/lib/format` → `formatMoney`, `formatDateShort`
- `@/lib/domain` → `ACCOUNT_TYPES`, `ACCOUNT_OWNERSHIP`, `accountTypeLabel`, `TX_DIRECTIONS`, category helpers
- `@/components/ui/label` → `MapleLabel`
- `globals.css` tokens: `--color-ink`, `--color-ink-2`, `--color-ink-3`, `--color-paper`, `--color-paper-2`, `--color-cream-2`, `--color-hair`, `--color-leaf`, `--color-leaf-soft`, `--color-maple`, `--color-maple-soft`
- `maple-input`, `maple-select` utility classes (from `globals-patch.css`)

If any of those aren't in your project yet, check `README-batch2.md` and `globals-patch.css` from batch 2.

---

## Server actions

I didn't rewrite any `actions.ts` — the function signatures (`createTransaction`, `updateBudget`, `createSettlement`, `createAccount`, etc.) match what you already have. If a signature differs, the TS error will tell you exactly which FormData key to rename.

## What's left (batch 5 — next turn if you want)

- Reports: P&L, Balance Sheet, Net Worth trend
- Setup: members, categories, household settings
- Auth: sign-in / sign-up pages
