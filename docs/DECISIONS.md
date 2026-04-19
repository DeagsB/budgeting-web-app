# Project decisions

Running log of scope + architecture choices. Claude (in autonomous mode) records decisions here rather than asking for each one; user reads the diff and redirects if needed.

Format: one `##` per decision, dated, with the alternatives considered and why this choice won.

---

## 2026-04-19 — MVP scope

**In scope for v1:**
1. Auth (email + password) and account/household setup
2. Household with 1..N members; everything downstream is per-member or shared
3. Accounts (chequing, savings, TFSA, RRSP, FHSA, crypto, loan) — opening balances + type + owner (member or shared)
4. Transactions — manual entry; date, amount, account, category, description, assigned member
5. Categories (hierarchical: parent + prefix-matchable children, mirroring the workbook's `SUMIF(... "CODE*"...)` pattern)
6. Monthly budgets per category
7. Budget vs Actual view (the single highest-value sheet in the workbook)

**Deferred to later phases:**
- Investment balance tracking over time (workbook sheets 8, 9)
- RRSP/TFSA/FHSA contribution-room tracker (sheets 12, 13) — requires CRA-rule engine
- Balance sheet / net worth (sheet 7)
- Loan amortization (sheet 11)
- Vacation & FLEX hours (sheet 2)
- Goals / large-purchase tracker (sheet 10)
- Multi-currency
- Institution sync / Plaid / Flinks integration

**Why:** The `Expense Schedule → Budget vs Actual` loop is the load-bearing feature of the workbook — it's the view the owner actually opens monthly. Shipping it first yields the highest user value per hour and de-risks the hardest schema question (transactions + category code matching). Everything else is layered on top of that foundation.

---

## 2026-04-19 — Answers to the 5 open questions from workbook-spec.md

### 1. Account-type taxonomy

Ship with this enum, extensible later:
`chequing`, `savings`, `tfsa`, `rrsp`, `fhsa`, `crypto`, `taxable_investment`, `loan`, `credit_card`, `cash`.

**Deferred:** `resp`, `lira`, `group_rrsp`, `margin`, `pension`. Add when a user asks.

**Why:** Matches workbook usage with headroom for the common Canadian registered types. Avoids forcing the user to choose between "generic" and "too-specific" too early.

### 2. Category codes

App defines its own categories. User can edit, but we ship a sensible Canadian-household default set on household creation.

- Top-level categories (parents): Housing, Transportation, Food, Health, Personal, Subscriptions, Entertainment, Savings-contribution, Taxes, Debt-payment, Miscellaneous.
- Each has an auto-generated short `code` (e.g. `HOUS`, `TRANS`, `FOOD`).
- Sub-categories allowed (child of parent, code = `PARENT.CHILD`).
- Transactions link by `category_id` (FK), not code string — avoids the workbook's string-prefix-match fragility.

**Why:** The workbook's `SUMIF("G*"…)` pattern works in a spreadsheet but is brittle in a real DB. Modeling category hierarchy explicitly (parent/child rows) gives us the same roll-up behavior without string-prefix tricks.

### 3. Joint vs individual accounts

`accounts.ownership`: enum `{ member, shared }`.
- `member`: has a `member_id` FK.
- `shared`: has a nullable `member_id`; UI defaults to "household" owner.

Transactions inherit account ownership for reporting but can override `member_id` per transaction (e.g. one partner's personal purchase on a shared credit card).

**Why:** Every real household has both. Forcing everything to a single owner breaks the mental model; forcing everything shared loses per-member reporting.

### 4. Balance-sheet snapshot cadence

**Deferred to phase 2** — MVP doesn't ship the balance sheet yet. When we do: nightly auto-snapshot via Supabase `pg_cron`, plus on-demand "snapshot now" button. Store one row per (account, date) in `account_balance_snapshots`.

### 5. Historical vs projected investment rows

**Deferred to phase 2.** When implemented: one table `investment_balances` with `kind: 'actual' | 'projected'` discriminator. Actuals immutable once set; projections recomputable from a formula spec tied to the account.

---

## 2026-04-19 — Supabase schema hosting strategy

Migrations live in `supabase/migrations/*.sql`, applied via Supabase CLI (`supabase db push`) or, for MVP simplicity, copy-pasted into the Supabase SQL editor on the project dashboard. Every table has RLS enabled from day one — no unprotected tables ever, even for "internal" tables.

**Why:** RLS-from-day-one is much easier than retrofitting. Supabase CLI adds a step (install + auth + project link) that's worth it once the project has a staging environment but overkill for a single solo dev.

---

## 2026-04-19 — Auth: email + password only for MVP

Email + password via Supabase Auth, with email confirmation enabled. No OAuth (Google, etc.) in v1 — add when there's demand.

**Why:** One less moving piece. Email+password is boring, well-understood, and works everywhere.

---

## 2026-04-19 — Money representation

Store all money as **integer minor units** (cents) in a `bigint` column. Currency implicit `CAD` in v1, column included for future-proofing but not exposed in UI.

**Why:** `numeric` works but opens the door to rounding inconsistencies across JS (`number`), PostgreSQL, and display. Integer cents is the boring right answer for currency.
