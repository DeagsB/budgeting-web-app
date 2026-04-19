# Workbook Structural Spec

**Status:** First-pass skeleton extracted from `spec/_extract/xl/`. Values have been stripped; formula shapes and cross-sheet dependencies are preserved. Depth per sheet is still shallow — see `⚠` markers for areas to revisit before schema design.

All personal data (names, bank/broker names, vendor names, vehicle model, employer, dollar amounts) has been replaced with generic placeholders. The `A –` / `B –` sheet prefixes denote **per-member** sheets, not fixed partner slots — the target product supports 1..N members.

## Dependency graph

```
(4) Expense Schedule ── raw transaction ledger, hand-entered
        │
        ▼
(5) Budget vs Actual ◄── (3) Profit and Loss
        │
        ▼
(6) Accumulated Surplus/Deficit

(8) Investment Growth – member A ─┐
(9) Investment Growth – member B ─┤
                                  │
(12) Contributions – member A ────┼──► (7) Balance Sheet ──► (1) Summary
(13) Contributions – member B ────┤
                                  │
(11) Vehicle Loan (hidden) ───────┘

(2) Vacation/FLEXTOIL — feeds (3) Profit and Loss (hours → income lines)
(10) Vehicle Purchase (hidden) — scenario sheet, optional feed into (1)
```

`(1) Summary` is the top of the DAG. `(4) Expense Schedule` is the only pure input sheet for day-to-day activity. Per-member sheets (`8/9`, `12/13`) are structurally identical pairs — schema should model them as one table keyed by `member_id`.

---

## Sheet 1 — Summary

**Purpose:** Executive dashboard rolling up net worth, investment growth, loan progress, and contribution room.

**Formula shapes:**
- Roll-ups across member sheets: `=SUM(member_A_sheet!range) + SUM(member_B_sheet!range)` — generalize to `SUM over members` in the web app.
- Loan-interest total: `=SUM('Vehicle Loan'!interest_column)` (pulls from sheet 11).
- Investment goals are hard-coded sums of per-member target amounts — treat as user-editable inputs, not formulas.

**Depends on:** 7, 8, 9, 11, 12, 13.

---

## Sheet 2 — Vacation and FLEXTOIL

**Purpose:** Tracks flexible-time-off hours accrued vs used, by month.

**Formula shapes:**
- FLEX accrual at 1.0x rate: `=(weekly_hours - standard_hours) * accrual_multiplier`
- Month-end stamp: `=EOMONTH(date, 0)`
- ⚠ **Needs clarification:** Vacation accrual rate doesn't appear in a formula — likely either manual entry or expected from HR data. Schema should let per-member accrual rules be configurable.

**Feeds:** 3 (hours → income lines on P&L).

---

## Sheet 3 — Profit and Loss

**Purpose:** Monthly income statement — income line items, fixed + variable expenses, net profit.

**Formula shapes:**
- Income total per month: `=SUM(income_line_items)` — original cells sum several hand-entered values; treat each line item as a row.
- Expense total per month: `=SUM(expense_line_items)` (range across fixed-expense rows).
- Net profit: `=income_total - expense_total`.

**Depends on:** 2 (income lines tied to FLEX hours). **Feeds:** 5, 6.

⚠ **Needs clarification:** Some income cells are sums of 3+ hand-entered values with no label breakdown in the XML — the underlying categories may live in cell comments. Check `spec/_extract/xl/comments3.xml` before finalizing P&L line-item schema.

---

## Sheet 4 — Expense Schedule

**Purpose:** Raw transaction ledger. ~1000 rows. Columns: date, vendor/description, category code, amount.

**Formula shapes:** None — this sheet is pure input.

**Feeds:** 5 (via `SUMIF` lookups).

**Schema implication:** This is the `transactions` table. Category codes (single-letter prefixes on vendor strings, per the SUMIF pattern in sheet 5) should become a proper FK to a `categories` table.

---

## Sheet 5 — Budget vs Actual

**Purpose:** Monthly budget-vs-actual comparison by category.

**Formula shapes:**
- Actual per category: `=SUMIF('Expense Schedule'!category_col, category_code & "*", 'Expense Schedule'!amount_col)` — the `"*"` wildcard implies category codes are prefixes (e.g. `G001`, `G002` all roll into `G`).
- Variance: `=actual - budgeted`.

**Depends on:** 3, 4.

---

## Sheet 6 — Accumulated Budget Surplus/Deficit

**Purpose:** Running cumulative variance per category across months.

**Formula shapes:**
- Cumulative per category: `=SUMIF('Budget vs Actual'!category_col, category, 'Budget vs Actual'!variance_col)`
- Grand total: `=SUM(category_rows)`.

**Depends on:** 5.

---

## Sheet 7 — Balance Sheet

**Purpose:** Assets / liabilities / equity snapshot at a single point in time (date appears to be user-edited).

**Sections:**
1. Cash accounts (per member + shared)
2. Investments (TFSA, RRSP, FHSA, crypto, taxable savings) — pulled from sheets 8/9
3. Intangible assets (pension equity, etc.)
4. Liabilities (vehicle loan balance from sheet 11)
5. Equity = assets − liabilities

**Formula shapes:**
- Pension value estimate: `=(monthly_pension_payment * 12) * years_to_receive` — a simple undiscounted projection; real NPV is not computed.
- Total assets: `=cash_total + investment_total + intangible_total`.
- Equity: `=total_assets - total_liabilities`.

**Depends on:** 8, 9, 11.

⚠ **Needs clarification:** Intangibles section mixes projected pension with other hand-entered items; the separation rules are unclear from the XML alone. Also, the "as-of" date is not a live formula — it's a user-entered cell, so the sheet doesn't auto-snapshot. In the web app, historical balance sheets probably want real snapshotting (a `balance_snapshots` table).

---

## Sheet 8 — InvestmentSavings Growth (member A)

## Sheet 9 — InvestmentSavings Growth (member B)

(Structurally identical — document together.)

**Purpose:** Per-member monthly tracking of invested balances across account types (TFSA, RRSP, FHSA, crypto, taxable savings).

**Layout:** Rows = months. Columns = account types. Each cell = month-end balance.

**Formula shapes:**
- Carry-forward start: `=prior_month_ending_balance` (`=$B5` style).
- In-month change: `=starting_balance + contributions - withdrawals + return` — though in the source many cells are hand-entered sums of several values rather than a parametric formula (mixing deposits, market moves, transfers).
- Projected future balances (lower rows): `=starting_balance * (1 + rate)^years_elapsed` — compound growth, though the rate is hard-coded per row, not referenced from a single source cell.

**Depends on:** (member-A sheet) 12, (member-B sheet) 13.
**Feeds:** 1, 7.

⚠ **Needs clarification:** Can't distinguish from the XML whether each month's change is:
- (a) user-entered post-hoc from brokerage statements, or
- (b) computed from contributions + an assumed rate.

Both appear to coexist — historical rows are hand-entered, projected future rows use compound-growth formulas. Schema needs to support both "actual" and "projected" entries per account-month.

---

## Sheet 10 — Vehicle Purchase Tracker *(hidden)*

**Purpose:** Scenario sheet for a planned large purchase — down-payment saving, budget gap, target date.

**Formula shapes:**
- Total required: `=SUM(purchase_cost_components)`.
- Budget remaining: `=accumulated_savings - accumulated_expenses`.

**Depends on:** optionally 1, 8, 9.

**Schema implication:** This is a **goals** feature, not core budgeting. Model as `goals` table (name, target_amount, target_date, funding_source_account_id). Don't hard-code "vehicle" in the UI.

---

## Sheet 11 — Vehicle Loan Progress Tracker *(hidden)*

**Purpose:** Amortization schedule for an installment loan — per-period payment, interest, principal, remaining balance.

**Formula shapes:**
- Payment: user-entered composite — the workbook sums a base payment with several hand-entered extras (accelerated principal, occasional lump sums). The XML shows `=base*n + extra_1 + extra_2 + extra_3` patterns with the extras being literal numbers.
- Principal portion: `=total_payment - interest_accrued`.
- Ending balance: `=starting_balance - principal_portion`.

**Depends on:** (standalone, with outputs to 1 and 7).

⚠ **Needs clarification:** No explicit interest-rate formula is present — interest is entered directly per month rather than computed from `balance * rate / periods`. In the web app, derive interest from a stored annual rate; allow extra-payment entries as a separate input stream.

---

## Sheet 12 — RRSP, TFSA & FHSA Contributions (member A)

## Sheet 13 — RRSP, TFSA & FHSA Contributions (member B)

(Structurally similar — document together with noted differences.)

**Purpose:** Track per-member registered-account contribution room, usage, and available balance across multiple tax years and account types.

**Layout:** Sections for RRSP, TFSA, and FHSA, each with columns per tax year. Rows track contributions, withdrawals, carryforward, and running available room.

**Formula shapes (generalized):**
- Available room for year N:
  `= prior_room + annual_cra_limit_year_N + (re-contributions) - contributions_year_N - spousal_attributions`
- Projected room for next year:
  `= current_year_available + next_year_cra_limit - planned_contributions`
- TFSA with multi-year carryforward:
  `= SUM(annual_limits_all_years) - SUM(lifetime_contributions) + SUM(lifetime_withdrawals_one_year_lagged)`
- FHSA (periodic contribution plan):
  `= periods_elapsed * contribution_per_period`
- RRSP (periodic):
  `= periods_elapsed * contribution_per_period`

**Depends on:** (member-A) 8, (member-B) 9. **Feeds:** 1.

⚠ **Needs clarification — important:**
1. CRA annual limits are **hard-coded literals** in the formulas (e.g. `=opening_room - SUM(usage_cells)` where `opening_room` is a numeric literal specific to the workbook owner's CRA history). In the web app:
   - Per-year CRA ceilings (TFSA, FHSA) come from a shared `cra_limits` table — app-managed, not user-entered.
   - Per-member opening room (RRSP especially — it depends on historical income and pension adjustments) is **user-entered** from the CRA Notice of Assessment. The app can't derive it.
2. Sheet 13 (member B) has a **four-year TFSA tier** that member A's sheet doesn't — this is happenstance of the source user's history, not a structural difference. Schema should support arbitrary years uniformly.
3. Spousal-attribution cells (contributions made by one partner credited to the other's room) exist but the rules aren't labeled — need to confirm which account types allow this (TFSA: no, RRSP spousal plans: yes, FHSA: no).

---

## Open questions for schema design

These need to be resolved before drafting the Supabase schema:

1. **Account types taxonomy.** Workbook uses: chequing, savings (non-registered), TFSA, RRSP, FHSA, crypto, loan. Are there others the user tracks elsewhere? What about RESP, LIRA, margin, employer-matched group plans?
2. **Category codes.** The `SUMIF` wildcard pattern in sheet 5 implies category codes are prefix-based (e.g. `G*` matches all groceries sub-codes). Is there an existing code list, or should the web app define its own?
3. **Shared vs per-member.** Which accounts in the source workbook are joint vs individual? The XML doesn't distinguish — cells referenced from "member A" sheets could be joint accounts the user assigned there for convenience. Need user input.
4. **Snapshot cadence.** Balance Sheet is a single point-in-time in the workbook. Web app should decide: nightly snapshots? On-demand? Triggered by transactions?
5. **Historical vs projected rows.** Sheets 8/9 mix actuals and projections. Should the app separate these into two tables, or use a `kind: 'actual' | 'projected'` discriminator on one table?

---

## Files consulted

- `spec/_extract/xl/workbook.xml` — sheet order and names
- `spec/_extract/xl/_rels/workbook.xml.rels` — sheet-to-file mapping
- `spec/_extract/xl/worksheets/sheet{1..13}.xml` — cell data and formulas
- `spec/_extract/xl/sharedStrings.xml` — string table
- `spec/_extract/xl/calcChain.xml` — evaluation order (secondary)
- `spec/_extract/xl/comments{1..9}.xml` — cell comments (spot-checked, not exhaustive)

This spec was generated from a first pass. Deepening passes per sheet are warranted before migration/schema drafts.
