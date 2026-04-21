# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this project is

A web app that replicates the structure and formulas of a personal-finance Excel workbook as a multi-user product. Domain: **Canadian personal finance** — RRSP, TFSA, and FHSA contribution tracking must follow current CRA rules.

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind v4** — scaffolded via `create-next-app` with `src/`, ESLint, `@/*` alias
- **React 19**
- **Supabase** for Postgres + auth — `@supabase/supabase-js` + `@supabase/ssr` installed; server + browser + proxy clients at `src/lib/supabase/`
- **Vercel** for hosting, **GitHub** for source

**Next.js 16 and React 19 are post-training-cutoff.** APIs, file conventions, and caching rules differ from earlier versions. Consult `node_modules/next/dist/docs/` (and React 19 release notes) before writing any Next.js or React code — do not rely on memory of App Router patterns from Next 13/14/15.

**Next 16 breaking rename:** what Next 13/14/15 called `middleware.ts` is now `proxy.ts` with an exported `proxy()` function. Lives at `src/proxy.ts`. Supabase's published SSR docs still say "middleware" — the file/function rename is the only Next-side difference.

## Commands

- `npm run dev` — start dev server (http://localhost:3000)
- `npm run build` — production build
- `npm run start` — serve production build
- `npm run lint` — ESLint

## Architecture

- `src/app/` — App Router routes.
  - `page.tsx` — public landing; reflects auth state.
  - `dashboard/page.tsx` — authed-user home (stub).
  - `(auth)/` — sign-in + sign-up pages (route group, doesn't affect URL).
  - `(auth)/actions.ts` — `signIn`, `signUp`, `signOut` Server Actions.
  - `auth/confirm/route.ts` — email-confirmation callback (Supabase `verifyOtp`).
- `src/lib/supabase/` — three client builders:
  - `client.ts` → `createBrowserClient` for Client Components.
  - `server.ts` → `createServerClient` for Server Components / Server Actions / Route Handlers.
  - `proxy.ts` → `updateSession` helper that runs inside the Next proxy to refresh the Supabase session on every request. Wired up by `src/proxy.ts`.
- `supabase/migrations/` — SQL migrations. Apply via `supabase db push` or paste into the dashboard SQL editor. Every table has RLS enabled; access is gated by `is_household_member()`.
- `docs/workbook-spec.md` — structural spec extracted from the source workbook. Sanitised (no personal data).
- `docs/DECISIONS.md` — running log of scope/architecture choices. Append new decisions here, don't ask for each one.

## Environment

Required env vars (copy `.env.example` → `.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Without these the app will crash on first request — sign up for a Supabase project, paste the URL and anon key.

## Auth model

- Supabase email+password, with email confirmation enabled.
- `getUser()` (or `getClaims()`) for any authorization decision. **Never use `getSession()`** — the user inside is unverified and spoofable.
- Proxy runs on every non-asset request and refreshes the session cookie when needed. If you add an unauthenticated route, update the `isAuthRoute` check in `src/lib/supabase/proxy.ts`.

## Money

All monetary amounts are stored as **`bigint` minor units (cents)**. Never use `numeric`/`float` for money. UI formats with `Intl.NumberFormat`.

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

## Mobile-first UI

Primary target: **iPhone Safari** (375–430px portrait). Desktop is a secondary layout that inherits via `sm:` / `md:` / `lg:` breakpoints.

Hard rules:
- **Tap targets ≥ 44×44 px.** Buttons, nav items, and row actions need adequate vertical padding. Avoid small `text-xs` link-style actions inside dense rows without a wrapping padded element.
- **No iOS zoom-on-focus.** Inputs must be ≥ 16px font-size. Set globally in `globals.css` — don't shrink inputs per-component.
- **Respect safe-area insets.** The root layout adds `env(safe-area-inset-*)` padding so content isn't hidden behind the notch / home indicator.
- **Wide tables scroll horizontally** inside an `overflow-x-auto` wrapper with `min-w-[XXpx]` on the table. Never allow the page itself to scroll horizontally — that causes the address bar to jiggle on iOS.
- **Header + action rows stack on mobile.** `flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between` — not the other way around.
- **Nav collapses on mobile.** The shell exposes a hamburger / sheet pattern below `md:`; the horizontal tab bar is desktop-only.

When adding new screens, mobile-first means writing the mobile layout first and using `sm:` / `md:` to adjust upward — not writing desktop and hoping.

## MCP servers

Project `.mcp.json` wires five servers. When planning or implementing, prefer these over guessing:

- **supabase** — Postgres / auth / migrations via MCP. Use `apply_migration` for DDL (not `execute_sql`). Use `execute_sql` for reads and one-off data fixes. `get_logs` for auth/postgres/edge debugging. `get_advisors` after DDL changes.
- **playwright** — headed browser for end-to-end verification. After any UI change, navigate the dev server (`npm run dev` at :3000), reproduce the change, and screenshot it. Use the test user `playwright-test@budgeting-app.local` — see `memory/reference_playwright_test_users.md` for the direct-insert pattern that bypasses Supabase signup validation.
- **context7** — fetch current library docs on demand. Use it before writing Next 16 / React 19 / Supabase SSR / Tailwind v4 code — training data is stale.
- **figma** — design-to-code. Trigger when the user pastes a `figma.com/design/...` URL or explicitly says they want a screen redesigned from Figma. `get_design_context` is the primary tool. Output is *reference*; always adapt to the project's token system + existing components, don't paste raw hex.
- **shadcn** — component library. Use when the user asks for a specific pattern (dialog, combobox, date picker, toast, sheet, etc.). `search_items_in_registries` to find the right primitive, `get_item_examples_from_registries` for usage, `get_add_command_for_items` to get the `npx shadcn add ...` command. Prefer shadcn primitives over hand-rolling once the user greenlights a UI polish pass.

UI polish rule of thumb: hand-rolled Tailwind first (cheap, flexible), shadcn for anything interactive enough to warrant a headless-UI primitive (menus, dialogs, sheets, comboboxes). Don't replace simple buttons or cards with shadcn — it adds dependencies without gain.
