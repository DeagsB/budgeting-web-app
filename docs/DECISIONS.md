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

## 2026-04-24 — Multi-account routing + bank presets + on-demand sync

User has multiple RBC accounts (chequing + credit card) with $1-threshold transaction alerts on each, and asked for two things: (1) one rule that auto-routes to each account, and (2) hourly default trigger with the ability to fetch on demand.

**Discriminator routing (one rule → N accounts):**
- `accounts.last_four` text + uniqueness per household
- `bank_email_rules.account_router_regex` text — captures group 1 from body, looked up against accounts.last_four
- Engine in `src/lib/email-ingest.ts` falls back to `default_account_id` when nothing matches (e.g. e-transfer received with no card number)
- Account form + edit row gain a "Last 4" field; rule form gains "Account router regex" + relabels "Default account" → "Fallback account"
- Smart Suggester auto-detects "ending in NNNN" / "se terminant par NNNN" patterns

**Bank presets:**
- `src/lib/bank-presets.ts` — tuned rules for RBC, TD, BMO, CIBC, Scotiabank, National Bank
- "Quick start: pick your bank" chip panel at the top of Step 4; one click installs a rule
- Universal account_router_regex (`ending\s+(?:in|with)\s+(\d{4})|se terminant par\s+(\d{4})`) covers all big-six formats
- Fallback account auto-set to the household's first non-archived account; user edits if needed

**Hourly default + on-demand sync:**
- Apps Script template now includes `doGet()` so the script can be deployed as a Web App (Anyone-with-link, execute as Me)
- Walkthrough trigger frequency dropped from "every 5 minutes" to "every hour" — combined with on-demand pull this is plenty without burning Apps Script quota
- New `households.gmail_sync_url` column stores the user's `/exec` URL
- Server actions `saveSyncUrl` + `triggerGmailSync` (the latter `fetch()`s the script URL and parses its JSON response)
- "Sync now" button in Step 5 of the auto-setup wizard
- Smaller "Sync" pill at the top of `/transactions` so power users can pull right after a swipe; degrades to "Set up sync →" link when no URL is configured

**Why hourly + on-demand vs every-5-min:**
288 invocations/day on a free Google account is fine for quota but feels heavy. Hourly = 24 invocations/day, plus on-demand whenever the user wants freshness. The PWA "Sync" button means it's never more than two taps away.

---

## 2026-04-24 — Reduce auto-import setup friction

User observed the email auto-import setup was high-touch (deploy a Gmail script, hand-write regex). Considered Gmail OAuth + server-side polling as the biggest unlock, but it's a 1.5–2 day investment requiring a Google OAuth client and Vercel cron — overkill for the first iteration. Shipped two cheap-but-high-impact improvements instead:

1. **Smart suggester** — a green-tinted panel at the top of the rule form. User pastes a real bank-alert email (from / subject / body), heuristics in `src/lib/email-suggest.ts` extract the dollar amount, merchant phrase, and direction; the form fields fill in. Includes friendly notes about what was detected vs. what's a guess. Eliminates ~70% of regex friction without any new dependencies.

2. **Send test email + live tail** — Step 5 has a "Test the pipeline now" panel with a button that POSTs a synthetic alert to the household's own webhook (using `headers()` to build the absolute URL). The verify table is now a polling client component (5s interval, paused on `visibilityState=hidden`) so the test result and any real Gmail-script ingestions land in the table without manual refresh. Pipes through clean error messages on 503 etc.

**Deferred:** Gmail OAuth + server polling (replaces the Apps Script entirely) and an auto-categorization rule engine. Both are documented in conversation context for the next iteration if friction stays bothersome.

---

## 2026-04-24 — Pivot to PWA (no native rewrite)

User wants the app to feel like an iOS app, not a web app. Considered:
1. **PWA** — add manifest, SW, iOS meta tags. ~1 day, zero throwaway, $0/yr.
2. **Capacitor wrapper** — bundle Next.js in iOS shell. App Store + native APIs but $99/yr Apple Dev + a Mac.
3. **React Native rewrite** — reuse Supabase, throw away every screen. Weeks-to-months.
4. **SwiftUI rewrite** — months, throw away everything except DB.

**Chose PWA.** Single-user app, no App Store distribution needed, no push-notification requirement. The existing site is already mobile-first (44px tap targets, safe-area insets, 16px inputs, mobile-first breakpoints). PWA gets us "icon on home screen, no browser chrome, splash screen" with everything we've already built intact. If we ever need push / Face ID / App Store, Capacitor wraps the same Next.js bundle — small migration.

**What ships:**
- `app/manifest.ts` (start_url=/dashboard, display=standalone, theme_color=cream)
- `app/icon.tsx` (512x512, leaf-green tile, cream serif M) + `app/apple-icon.tsx` (180x180) — both generated at runtime via `next/og`'s `ImageResponse`, no binary commits
- `app/layout.tsx` — apple-mobile-web-app-* meta, format-detection=no for money strings, per-scheme theme colors
- `public/sw.js` — minimal hand-written SW: cache-first for `/_next/static/*`, network-first for navigations with `/offline.html` fallback, never caches `/api/*`/`/auth/*`/`/rest/v1/*` (financial data must stay live)
- `public/offline.html` — standalone fallback page with Maple chrome
- `next.config.ts` — `Cache-Control: no-cache` on `/sw.js`
- `src/lib/supabase/proxy.ts` — whitelist `/manifest.webmanifest`, `/sw.js`, `/icon`, `/apple-icon`, `/offline.html`, `/favicon.ico` so OS install prompts can fetch them without a session
- `src/components/pwa/sw-registrar.tsx` — registers SW on load (production-only by default; opt into dev with `NEXT_PUBLIC_SW_IN_DEV`)
- `src/components/pwa/ios-install-hint.tsx` — bottom card shown once to Safari iOS users with "Tap Share → Add to Home Screen" (iOS gives no `beforeinstallprompt` event)
- `src/app/(app)/shell.tsx` — replaced mobile hamburger with a fixed bottom tab bar (Home / Activity / Budgets / Accounts / More). Five tabs is the iOS native cap; secondary nav (Reports, Setup) lives in the More sheet
- `src/app/globals.css` — momentum scrolling, `overscroll-behavior: none` on html, `-webkit-touch-callout: none` on tappables, `.maple-chrome` opt-in to disable selection on UI furniture, standalone-mode-only padding adjustments

**Considered + rejected:**
- *Workbox / Serwist*: more capable but adds build-step complexity. Hand-rolled SW is ~80 lines and does what we need.
- *next-pwa*: unmaintained for the App Router; documented Next 16 path is hand-rolled.
- *Push notifications*: skipped for v1. iOS PWA push requires VAPID + iOS 16.4+ + a backend store for subscriptions. Email auto-import is already the "tell me about transactions" path.
- *Splash screen images*: iOS requires per-device-size PNGs (~10 different files). Skipped for v1 — iOS falls back to the apple-icon on a theme-color background, which looks fine.

---

## 2026-04-24 — Auto-import: self-hosted email + OFX, no third-party aggregator

User wants transaction input to be a "killer QOL feature" but also wants to run the
app at $0/month. That rules out paid aggregators (Plaid, Flinks, MX) for the
foreseeable future. Going with two free, complementary paths:

1. **Email-alert ingestion** (the QOL win). User enables transaction alerts in
   their bank's online banking, a Gmail Apps Script forwards each alert to
   `POST /api/ingest/email` on a 5-minute cron. The webhook authenticates via a
   per-household secret stored in `households.email_ingest_secret` (rotated via
   the `rotate_email_ingest_secret` RPC) and uses the Supabase service-role key
   to bypass RLS for inserts. Per-bank parsing is configurable via the
   `bank_email_rules` table — regex for from-address, subject, amount,
   description, date, sign convention. Every webhook hit is recorded in
   `email_ingestion_log` for debugging.

2. **OFX/QFX file import** (the catch-all). Extended the existing CSV import
   wizard to also accept `.ofx`/`.qfx` files. Parsing is done in-browser by
   `src/lib/ofx.ts`. OFX rows carry a `FITID` which we persist to
   `transactions.external_id`; the new `(household_id, external_id)` unique
   index dedups re-imports automatically.

**Schema additions (migration 20260424000001):**
- `transactions.source` text check ('manual', 'csv_import', 'ofx_import', 'email_alert')
- `transactions.external_id` text + unique partial index for dedup
- `households.email_ingest_secret` text unique
- `bank_email_rules` table (per-household regex rules, RLS to household)
- `email_ingestion_log` table (read-only for household members; route handler writes via service role)

**Considered + rejected:**
- *Plaid free tier*: works for one user but ToS-grey for personal production use
  and could break with no migration path. Held in reserve.
- *Per-rule SECURITY DEFINER RPC instead of service-role client*: cleaner auth
  surface (no service-role key needed) but every parsing/log/insert step would
  need its own DB function. Service-role client is one moving piece, easier to
  audit.
- *Inbound email service (CloudMailin / SendGrid Inbound Parse)*: would let us
  receive emails directly instead of via Gmail. Free tiers exist but each adds
  another vendor; Gmail Apps Script keeps the surface to "Gmail + this app".

**New env var:** `SUPABASE_SERVICE_ROLE_KEY` is now required (was optional). The
email webhook returns 503 if it's missing. CSV-only users can still ignore it
but the auto-import setup page will guide them to add it.

**Setup walkthrough lives at `/transactions/import/auto-setup`** — five-step
wizard styled with the Maple tokens to match the rest of the product. Discoverable
from a leaf-tinted call-to-action card on the Import page.

---

## 2026-04-19 — Money representation

Store all money as **integer minor units** (cents) in a `bigint` column. Currency implicit `CAD` in v1, column included for future-proofing but not exposed in UI.

**Why:** `numeric` works but opens the door to rounding inconsistencies across JS (`number`), PostgreSQL, and display. Integer cents is the boring right answer for currency.
