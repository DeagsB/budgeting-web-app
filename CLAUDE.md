# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this project is

A web app that replicates the structure and formulas of a personal-finance Excel workbook as a multi-user product. Domain: **Canadian personal finance** — RRSP, TFSA, and FHSA contribution tracking must follow current CRA rules.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind v4** — scaffolded via `create-next-app` with `src/`, ESLint, `@/*` alias
- **React 19**
- **Supabase** for Postgres + auth (to be added)
- **Vercel** for hosting, **GitHub** for source

**Next.js 16 and React 19 are post-training-cutoff.** APIs, file conventions, and caching rules differ from earlier versions. Consult `node_modules/next/dist/docs/` (and React 19 release notes) before writing any Next.js or React code — do not rely on memory of App Router patterns from Next 13/14/15.

## Commands

- `npm run dev` — start dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint

## The source spreadsheet is a *formula spec*, not seed data

`spec/Excel Example.xlsx` is the single source of truth for what the app must compute. It has been unzipped to `spec/_extract/` for inspection:
- `spec/_extract/xl/sharedStrings.xml` — labels and text
- `spec/_extract/xl/worksheets/sheet*.xml` — cell formulas
- `spec/_extract/xl/workbook.xml` — sheet order and names
- `spec/_extract/xl/calcChain.xml` — cell evaluation order (useful for understanding dependencies between sheets)

The 13 sheets (two are hidden in the workbook):
Summary · Vacation and FLEXTOIL · Profit and Loss · Expense Schedule · Budget vs Actual · Accumulated Budget Surplus/Deficit · Balance Sheet · A – InvestmentSavings Growth · B – InvestmentSavings Growth · New BMW Purchase Tracker *(hidden)* · BMW Loan Progress Tracker *(hidden)* · A – RRSP, TFSA & FHSA Contributions · B – RRSP, TFSA & FHSA Contributions

Sheets prefixed `A –` / `B –` correspond to two partners in the original owner's household. **Treat these as per-member sheets, not fixed partner slots.**

## Non-negotiable product constraints

These apply to schema design, UI copy, fixtures, and seed data alike:

- **Household has 1..N members.** Do not hard-code two partners, `A`/`B`, `partner_1`/`partner_2`, or any assumption of "couple". Model it as `household` → `members (N)` with a `member_id` FK; transactions/accounts/budgets are either assigned to a member or marked `shared`.
- **Strip all personal data from the workbook.** Names, specific accounts, loan details (e.g. the BMW trackers), and dollar amounts in the source file are one user's data, not defaults. Do not carry any of them into code, fixtures, migrations, or UI copy.
- **Formulas yes, values no.** When porting a sheet, extract the formula and the cell relationships — not the numbers.
- **CRA rules for tax-advantaged accounts.** RRSP/TFSA/FHSA contribution room, carry-forward, and over-contribution logic must match current-year CRA figures. Don't reuse the workbook's hard-coded limits.

## Inspecting the workbook

When you need a formula or the structure of a sheet, read the XML in `spec/_extract/` directly — the `.xlsx` is a zip and the XML is already unpacked. `sharedStrings.xml` resolves string indices referenced by `<c t="s"><v>N</v></c>` cells in each sheet.
