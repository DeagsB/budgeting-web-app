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

---

## 2026-08-26 - Plaid adopted as the primary ingest (supersedes "no third-party aggregator")

The 2026-04-24 decision rejected Plaid on cost and ToS grounds and made Gmail-forwarded email alerts the primary path.
Both premises changed.
Plaid's Production tier is free up to a small number of linked Items, which covers one household.
The email path depends on each bank's alert format and on a Gmail Apps Script the user must keep alive, and it silently stops when either drifts.
The user retired the Gmail sync; Plaid is now the only ingest that matters, with OFX/CSV import as the manual fallback.

**Model:** one `plaid_items` row per linked bank login, access token encrypted at rest with `PLAID_TOKEN_KEY`, accounts mapped to app `accounts` rows.
Sync is `/transactions/sync` cursor-based.

**Production hardening (migration 20260826000001, `src/lib/plaid-sync.ts`):**
- Cursor is written with compare-and-swap; a run that lost the race discards its page instead of double-inserting.
- A 5-minute sync lease on the item serialises webhook, daily cron and pull-to-refresh.
- A pending transaction that posts migrates the existing row (keeps category, splits, shares) instead of delete+insert.
  Rows the sync cannot update safely (amount changed after the user split or shared it) are flagged `needs_review`.
- Webhooks fail closed: unsigned or unverifiable payloads are rejected; verified ones enqueue the sync via `after()` so Plaid gets its 200 immediately.
- `GET /api/cron/daily` (Vercel Cron, `vercel.json`) sweeps every active item as a safety net for missed webhooks.
- `PLAID_ENV` defaults to `production` on a production build so a forgotten variable cannot point prod at sandbox.
  `PLAID_WEBHOOK_URL` and `PLAID_REDIRECT_URI` are required in production (`src/lib/env.ts`).

**Considered + rejected:**
- *Keep email ingest as a co-equal path*: two ingest paths means two dedup vocabularies and two failure modes to explain.
  The route and tables stay (nothing depends on removing them) but the UI no longer promotes them.
- *Delete+insert on pending->posted*: simpler, but throws away the user's categorisation on every card purchase.

---

## 2026-08-26 - Web Push adopted (supersedes "push skipped for v1")

The 2026-04-24 PWA decision skipped push because email auto-import was the "tell me about transactions" channel.
With email ingest retired, push is the only way a Plaid-synced transaction, a budget overspend or a closed settlement period reaches the user without opening the app.

**Model (migration 20260601000001, `src/lib/push.ts`):** `push_subscriptions` holds one row per device that opted in; `households.notification_prefs` selects which events fire.
Sends go through the service-role client, are best-effort (never fail the webhook that triggered them) and prune dead subscriptions.
Recipient scoping mirrors row security: a transaction on a member-owned account reaches only that member's login; shared-account and household-level events reach everyone.

**Env:** `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`.

---

## 2026-08-26 - Per-member privacy: private by default, one login per member

A second login in the household must not see the first login's personal accounts.
Until now nothing tied a login (`household_users`) to a budgeting subject (`members`), so "which member am I" was unanswerable and every login saw everything.

**Model (migrations 20260826000002..000004):**
- `members.user_id` links a login to at most one member, globally.
  The column is locked behind SECURITY DEFINER RPCs (`claim_member`, invitation acceptance); clients cannot set it directly.
- Visibility rule: a login sees household-level rows (household, members, categories, budgets, rules, settlements, connections) plus the money that is theirs.
  An account is visible when it is `shared`, or owned by a member the caller can act as (their own member, or a member with no login yet).
  A transaction is visible when its account is visible, or its payer is such a member, or the caller's member holds a share of it.
  Shares, splits, snapshots and loan rows inherit from their parent.
- Editing excludes share-only visibility: seeing a bill you owe part of does not let you rewrite it (`tx_editable`).
- Cross-table checks live in SECURITY DEFINER helpers (`account_visible`, `tx_visible`, `can_access_member`) so no policy re-enters another table's policy; `transactions` and `transaction_shares` would otherwise recurse.
- Service-role code (Plaid sync, cron, push) bypasses RLS and is unaffected.
- Existing single-login households had their owner linked to their first member in the migration so nobody was locked out.

**Invitations (`household_invitations`, `/invite/[token]`):** an owner or admin invites an email to take over a specific unlinked member row.
The raw token travels only in the link; the table stores its SHA-256.
Invitations expire after 7 days.
Accepting adds the login to `household_users`, links the member, and absorbs the invitee's own empty household if they had created one.
The app always shows a copyable link because Supabase's default SMTP only delivers to the project team.

**Considered + rejected:**
- *Share-everything with an "is private" flag per account*: opt-in privacy leaks by default; the first Plaid link would expose a partner's whole chequing history before they found the toggle.
- *Separate households per person with cross-household sharing*: every household-level table (budgets, categories, settlements) would need a second scoping axis.
- *Policies written inline with subselects*: recursion between `transactions` and `transaction_shares` policies, and no single place to audit the rule.

---

## 2026-08-26 - Split ratio on members, first-wins rules, largest-remainder rounding

**Weights live on members (`members.split_weight`, migration 20260826000005).**
The household default split is a per-member integer weight: 1/1 is 50/50, 3/2 is 60/40, 0 means "never owes".
This works for any member count and needs no separate settings table; archived members are excluded at read time.

**Rules (`transaction_rules`, `/rules`, `src/lib/transaction-rules*.ts`).**
"Merchant contains X [amount range] [account] [direction] -> share by household ratio / custom weights / not at all, and/or set category."
Rules run on every ingest path (Plaid, OFX/CSV, manual add) and can be applied retroactively from the rules page.

Precedence is first-wins per action: rules are ordered by `(sort_order, id)`; the first matching rule that sets a share policy decides sharing, the first that sets a category decides category.
A rule can therefore say "everything at this merchant is groceries" without touching how it is shared.

Provenance: shares and split categories written by a rule carry the rule id.
Re-running never overwrites a manual edit (a share row with `rule_id = null` is left alone), and deleting a rule can undo exactly what it wrote.

**Rounding (`src/lib/share-split.ts`).**
Amounts are integer cents, so a 3-way split of $10.00 cannot be exact.
Largest-remainder apportionment: floor every exact share, then hand the leftover cents one at a time to the largest fractional parts, ties to earlier `sort_order`.
The payer's own portion is the implicit remainder and never gets a share row.
The same function serves "mark shared" and "auto-shared by rule" so the two always agree.

**Considered + rejected:**
- *Percentages instead of weights*: must sum to 100, breaks the moment a member is archived or added.
- *Last-wins / most-specific-wins precedence*: "most specific" has no total order once amount ranges and accounts mix; an explicit sort the user controls is predictable.
- *Round-half-up per share*: totals drift by a cent per transaction and the payer's leftover can go negative.

---

## 2026-08-26 - Settlement periods: stamp membership, carry forward, close on a schedule

The shared-expense tally used to be one ever-growing balance.
Real households settle up on a rhythm ("end of month, e-transfer the difference") and want a statement that does not change after they paid it.

**Model (migration 20260826000006, `src/lib/settlement*.ts`):**
- Exactly one `open` period per household (partial unique index).
  `households.settlement_close_day` (1..28, default 28) is when the daily cron closes it; "Close period now" closes early.
- Closing stamps every not-yet-stamped share dated on or before the close date with the period id, marks the period closed, and opens the next one from the following day.
  Membership is by stamp, not by date: a share that arrives late for a closed period lands in the open one, and a share is never counted twice.
- Balances stored on the period are an audit snapshot of what was notified, never an input to computation.
- Carry-forward: the open period's statement adds whatever each closed period still nets to after its own settlements, so an unpaid month rolls into the next statement instead of disappearing.
- "Mark settled" records one settlement per net line in one tap and flips the period to `settled`.
- Every household starts with an open period; the migration backfilled one from the earliest shared transaction so history lands in the first statement.

**Considered + rejected:**
- *Membership by transaction date*: a Plaid transaction that posts three days late would silently rewrite a statement the partner already paid.
- *Recompute closed-period balances live*: cheaper to store nothing, but the whole point is that a closed statement is immutable.
- *Per-member close days*: a period is a household fact; two members with different close days would never agree on a statement.

---

## 2026-08-26 - iOS audit fixes: balances, money entry, service worker, app shell

A full UI/UX/functionality audit against the "installed on an iPhone" bar found three correctness problems and a long tail of app-feel issues.
The fixes landed in one pass; the decisions worth keeping are below.

**Liability balances are the amount owing, positive (`src/lib/balances.ts`).**
An outflow on a liability raises what you owe; an inflow (a payment) lowers it.
Assets keep the old rule (outflow lowers the balance).
Plaid reports credit and loan balances as positive owing, so no sign flip is needed anywhere.
Before this, a credit-card purchase reduced the balance and the balance sheet showed liabilities negative.

**Plaid-linked accounts get a balance snapshot on link and after every sync (`src/lib/plaid-balances.ts`, `plaid-sync.ts`).**
A linked account starts with opening balance 0, so deriving its balance from synced transactions alone produced negative assets.
The snapshot is written for the current month, rolled back to the 1st by undoing this month's transactions, so the derived figure today equals Plaid `current` exactly.
`/transactions/sync` pages do not always carry `accounts` (sandbox never does), so a sync that yields no balances falls back to `/accounts/balance/get`.
A Plaid-written snapshot overwrites a hand-entered one for the same month: bank truth wins.

**Money is parsed in one place (`parseMoneyToCents`) and entered through one component (`MoneyInput`).**
Comma-only input treats the last comma as the decimal mark (fr-CA keyboards emit a comma), strict two-decimal validation, no silent rounding, and the field holds a raw string until blur so decimals can actually be typed.
The three forked parsers were deleted.

**The service worker never touches Next router traffic.**
Any request with an `RSC` header, `_rsc` query, prefetch or server-action header bypasses the worker; runtime caching is an explicit allowlist (icons, manifest, splash, fonts, images).
Updates wait for the user ("Update ready - Reload") instead of `skipWaiting`, which was producing chunk 404s mid-session after deploys.

**App shell: page title + back chevron in the header, one FAB for the primary verb, tab tint on the active tab.**
The in-page serif headline is desktop-only; on mobile the shell owns the title and the subtitle stays.
Filters on Transactions live behind one "Filter" pill (sheet) with removable chips, so the first row is above the fold.

**Dates: `src/lib/dates.ts` `todayISO()` is the only "today".**
Pinned to America/Toronto; the four raw-UTC call sites were rewritten.
A household timezone column can replace the constant later without touching call sites.

**Errors: `humanizeDbError` maps Postgres codes to sentences.**
No raw PostgREST message reaches the UI; terse internal assertions were reworded or replaced with the generic "Couldn't save that. Refresh and try again."

**Considered + rejected:**
- *Negative liability balances with display-time negation*: matched Plaid's sign at the storage layer badly and made every consumer flip signs.
- *Keeping `skipWaiting`*: the zero-friction update is not worth a white screen the first time a user taps a stale chunk.
- *A shell-level add-transaction sheet*: each page already loads the accounts/categories it needs; a shared sheet would have duplicated the queries.

## 2026-08-26 - Tab bar: centre "+", icon-grid More sheet, press-and-hold to place

**Bottom bar is three slots + a centre "+" + More.**
The per-page floating FAB is gone; the "+" lives in the bar's centre column (76px) where a thumb rests.
Slot count is fixed at three so the bar never crowds and the "+" always has the same neighbours.
Storage key bumped to `maple.tabBar.v2`; `normalizeTabs` pads or trims any stored list to exactly three known routes.

**"+" is wired through `QuickAddProvider` (`src/lib/quick-add.tsx`).**
Screens that host an add-transaction sheet (dashboard, transactions) register a handler with `useQuickAddTarget`, so the "+" opens the sheet in place.
Anywhere else it routes to `/transactions?add=1`; the transactions controls open the sheet on arrival and strip the flag with `router.replace` so back/refresh do not reopen it.
This keeps the earlier decision that the sheet is page-owned (each page already loads the accounts and categories it needs).

**More sheet is an icon tile grid; press-and-hold a tile to place it.**
Mirrors the Personal Time Tracker pattern: hold 350ms (10px of travel cancels) -> sheet closes, the three slots pulse as drop targets, a pill names the item, and a tap on a slot replaces it.
Tiles are `<button>`s rather than links because iOS Safari long-pressing a real link opens a page preview the gesture cannot suppress.
The list-based "Customize tabs" editor was removed; "Reset tabs" in the sheet footer restores the defaults.

**Considered + rejected:**
- *Drag-and-drop from the sheet onto the bar*: the sheet covers the bar, so the drag would have to cross a dismissing overlay; tap-to-place is one fewer thing to hold.
- *Keeping the FAB bottom-right as well as the centre "+"*: two entry points for one action.

---

## 2026-08-26 - Members must be logins; Mine / Shared / Shared with me

Supersedes the unlinked-member rule in "Per-member privacy" above.
The app no longer lets one login browse another member's money.
A login sees exactly three kinds of transactions: its own (accounts it owns and payments it made), joint (accounts with `ownership = 'shared'`, co-owned and fully editable by everyone), and crossovers (rows another member paid where the caller holds a `transaction_shares` row, read-only).

**Model (migration `20260826000007_login_only_members.sql`):**
- `can_access_member(m)` is now `user_id = auth.uid()` only.
  The `user_id is null` branch that made unlinked members' accounts visible to every login is gone, so a member row without a login is visible to nobody until it is claimed or an invitation is accepted.
  `account_visible` / `tx_visible` / `tx_editable` and every `accounts` / `transactions` policy route through it and needed no rewrite.
- Nothing is picked from a member list any more.
  The transaction payer (`member_id`) is stamped from `getHouseholdContext().memberId` on add, CSV/OFX import, and is never touched on edit or triage; the account owner is stamped the same way when ownership is "Mine".
  A login that has not claimed a member gets a clear error instead of an insert RLS would reject.
- `src/lib/tx-scope.ts` mirrors the SQL in TypeScript: `isTxEditable` is `tx_editable`, and `classifyTx` sorts a row into `mine` / `shared` / `with-me` by editability plus share count (not by payer, because ingest paths leave `member_id = null` on joint accounts).
  The Transactions filter uses those three scopes (`?scope=`) instead of a chip per member and an arbitrary `?member=<id>`.
- Accounts are labelled "Mine" / "Joint" everywhere; owner names are never rendered on money.
- The Shared page keeps its account-centric flagging view (RLS already limits the switcher to own + joint accounts) and adds a read-only "Shared with you" card listing the month's crossovers with the caller's share.
- Push: a member-owned account of a member with no login notifies nobody (previously the whole household, "because that is who could see it").
  Settlement close notifies each member with a login; there is no household fallback except the "all square" broadcast.

**Pre-flight:** the migration was applied after confirming no active account was owned by an unlinked member, so no data went dark.
If that ever changes, the query is `select a.id from accounts a join members m on m.id = a.member_id where a.ownership = 'member' and m.user_id is null and a.archived_at is null`; the fix is an invitation, not an automatic reassignment.

**Considered + rejected:**
- *Owner/admin-only access to unlinked members' accounts*: a second visibility axis to explain and audit, for a case (tracking a child's account) that "Joint" already covers.
- *Auto-reassigning orphaned accounts to joint*: silently widens who can see a ledger.
- *Classifying scope by payer*: Plaid and email ingest stamp `member_id = null` on joint accounts, so "paid by me" would miss half of "mine".

Household-level per-member tables (`member_contribution_rooms`, `time_off_entries`) are unchanged: they are settings, not ledgers.

---

## 2026-08-26 - Shared and Settle up merged; payments recorded from the ledger

`/settlements` is gone as a screen (the route redirects to `/shared`, keeping `?period=` so push links still land).
`/shared` now runs top to bottom the way a person thinks about shared money: what is owed now, statements waiting to be paid, payments the bank feed found, what others shared with you, the per-account flagging list, then history and the trend.
The "Record payment" form survives only as a collapsed by-hand fallback.

**Detection (migration `20260826000008_settlement_detection.sql`, `src/lib/settlement-match.ts`, `src/lib/settlement-detect.ts`):**
- `transaction_rules.is_settlement` marks a merchant as "a payment between members" (the one-tap starter is `INTERAC E-TRANSFER`, any direction).
  A settlement rule never shares; the action check accepts it in place of a share or a category.
- A matching ledger row is attributed to its payer, else its account's owner; an unattributed joint-account row is never a candidate.
  Sign gives direction: outflow means that member paid (`from`), inflow means they received (`to`).
- Decision order: link to a settlement on the books with the same pair, amount and a date within 7 days whose matching side column (`settlements.paid_transaction_id` / `received_transaction_id`) is still empty; else record against the one outstanding line that nets to exactly this amount (awaiting statements before the open period); else prompt.
  Linking is what stops the payer's outflow and the recipient's inflow from counting twice, and what lets "Mark settled" be confirmed by the bank later.
- Runs inside `applyRulesToTransactions`, so Plaid, email, CSV/OFX, manual add and retro-apply all detect; the statement is loaded once per run and only when a settlement rule matched.
- Prompts are computed at render (last 3 months of visible rows matching a settlement rule, minus linked, minus `transactions.settlement_ignored`), so there is no candidate table to keep in sync.
  "Not a payment" sets the flag and needs edit rights on the row; removing a ledger-recorded payment from history flags its rows too.

**Considered + rejected:**
- *Candidate table filled by a keyword heuristic*: second matching path beside rules, more state, and the household could not tune it.
- *One-tap only, no detection*: the point was to stop asking for something the bank already said.
- *Deleting a settlement when its ledger row is deleted*: the money still moved; the row was probably a duplicate cleanup. The FK sets the column null instead.

## 2026-08-26 - Shell chrome held still during route view transitions

**Context:** on iOS, tapping a bottom tab made the tab bar flicker and old page content flashed in the bottom-left corner.
Reproduced in Playwright WebKit and Chromium with the transition slowed to 4s.
Two mechanisms: the root cross-fade blended the old and new tab bars (active states ghosting into each other), and the page's own `.maple-fade` snapshot, taller than the viewport, painted above the fixed bar (csswg-drafts#8941).

**Decision:**
- The sidebar, mobile top bar, tab bar and status band each carry a `view-transition-name`, so they are captured apart from the page and held still: no group motion, no fade, no plus-lighter blend, z-index above the page group.
- Both the old and the new chrome snapshots stay visible and opaque instead of the "hide old, show new" recipe from the Next docs.
  WebKit builds without the fix for bugs.webkit.org/299578 render the live "new" snapshot of a fixed element blank; keeping the old bitmap underneath degrades that to "highlight lands a beat late" rather than a bar that vanishes for the transition.
- `html:active-view-transition .vt-solid` makes the translucent bars opaque only while a transition runs, so neither snapshot can ghost through the other.

**Considered + rejected:**
- *Painting a cream background on the new pseudo*: on the broken WebKit builds the background paints but the image does not, leaving a blank bar.
- *Dropping the route transition*: the fade is fine; only the chrome needed pulling out of it.

## 2026-08-27 - Guided onboarding: household → bank → invite → budget; explicit completion flag

**Context:** onboarding was two steps (household, one manual account) and "done" was inferred from row counts.
Plaid lived only under Transactions → Import → Connect a bank, so a first-run user never found bank sync.
Skippable steps make count-based inference impossible.

**Decision:**
- `households.onboarding_completed_at` (nullable, migration `20260827000001_onboarding_state.sql`) is the single source of truth, set only by the owner through `complete_onboarding()`.
  Existing households were backfilled so nobody already using the app is bounced.
  Invitees are never gated: the resolver returns `done` for any non-owner.
- The resume step is derived, not stored (`src/lib/onboarding.ts`): no accounts → bank; otherwise → invite.
  Invite and budget are quick and skippable, so re-showing invite on resume costs nothing.
- Plaid Link + account mapping moved out of the settings wizard into `src/components/plaid/plaid-connect.tsx` (`PlaidConnect`, `AccountMappingForm`, `usePlaidReauth`) so onboarding step 2, the settings page and the OAuth return page share one Link implementation.
  OAuth resume state is a pure module (`src/lib/plaid-oauth.ts`) and now also remembers the page that started the flow.
- One OAuth return URL, `/plaid/oauth-return`, outside the app shell and outside `/onboarding`, so neither redirect gate can swallow a bank hand-off.
- "Connect a bank" is reachable from `/accounts` (header + empty state) and `/setup` (a Bank connections card with status per bank); the Plaid page keeps its URL.
- One-off data wipes are a local script (`scripts/wipe-household.ts`) that removes Plaid items via the API, deletes transactions before the household row (the schema's only `on delete restrict` FK is `transactions.account_id`), and keeps `auth.users`.
  Dry-run is the default.

**Considered + rejected:**
- *`onboarding_step` column*: a second write per step for information that is cheaply derivable.
- *`wipe_household(uuid)` SQL function*: a permanent, privileged, destructive RPC in production for a one-off need.
- *Registering both `/onboarding/bank` and the settings page as Plaid redirect URIs*: two URIs to keep in sync, and the app-shell gate would still bounce an un-onboarded owner off the settings page mid-OAuth.
- *Moving the Plaid page under `/setup`*: the URL is bookmarked and breadcrumbed; a status card on Setup is enough.

## 2026-08-27 - Email through Resend; one layout for every message

**Context:** Supabase's built-in mailer only delivers to project team addresses, so sign-up confirmations and invites silently failed for anyone else, and the invite path leaned on `auth.admin.inviteUserByEmail` plus a magic-link fallback.
The one branded template lived as a hand-edited HTML file.

**Decision:**
- Supabase Auth emails (confirm signup, magic link, reset password, change email, invite user) are delivered through Resend SMTP, configured in the dashboard.
  Templates are generated from `src/lib/email/templates.ts` by `scripts/build-email-templates.ts` into `docs/email-templates/` and pasted into the dashboard; the source is the code, not the HTML files.
- Household invites are app-sent through the Resend SDK (`src/lib/email/send.ts`) with a richer message (household, inviter, member slot, one-time link).
  `inviteUserByEmail` and the OTP fallback are gone: the `/invite/<token>` landing already handles "create an account" and "I already have one", so no auth user needs to pre-exist.
  Delivery stays best-effort and the copyable link is always shown.
- One layout (`src/lib/email/layout.ts`: tables, inline styles, VML button, dark-mode classes, text alternative) renders every email so they read as one product.
- `RESEND_API_KEY` is required in production (`src/lib/env.ts`); `EMAIL_FROM` defaults to the Resend sandbox sender until a domain is verified.

**Considered + rejected:**
- *react-email*: a React render pipeline for five static emails; the table layout is already proven in the confirm-signup template.
- *Keeping Supabase invites and only fixing SMTP*: still two send paths and a metadata-driven "set password" detour for a flow the landing page already handles.
- *Notification digests by email*: out of scope; push covers alerts today.

## 2026-08-27 - Budgets are standing; rollover is gone

**Context:** budgets were stored per `(household, category, month)` and nothing carried them forward, so every new month opened blank even though the onboarding copy promised "budgets roll forward".
A household whose budget is the same number every month had to retype it twelve times a year.
Per-category rollover sat next to Rename / Archive as an unexplained word during first-run setup, and carrying a surplus forward is an envelope-budgeting idea that reads as ambiguous when the budget itself never changes.

**Decision:**
- `category_budgets` holds one standing amount per category that applies to every month until it is changed.
- `monthly_budgets` keeps its shape but changes meaning: a row there is an override for that single month, including an explicit zero ("nothing budgeted this month").
- The effective budget is resolved in one place, `src/lib/budget.ts` (`effectiveBudgets`, `budgetTotals`, `monthsInRange`), used by the budgets page, the dashboard hero and the overspend push alert.
- The budgets editor saves standing by default; a per-row "Every month / <Month> only" toggle pins one category to the month on screen. Switching a row back to standing drops that month's override.
- Rollover is removed everywhere: the toggle, the pill, the budgets-table column, and `categories.rollover_enabled`.
- The migration seeds each category's standing amount from the most recent month it was budgeted in, then deletes override rows for the current month and later so nothing shows as overridden on day one. Past months keep their rows - that really was the budget at the time.

**Considered + rejected:**
- *Auto-copying last month's amounts into a new month*: still per-month storage, so a change to a standing figure means editing every month that was already seeded.
- *A nullable `month` on `monthly_budgets` to mean "standing"*: one table with two meanings, and the unique constraint stops enforcing anything useful.
- *Keeping rollover behind an explanation*: the household's budget does not change month to month, so a carried surplus has nothing to attach to.

## 2026-08-27 - Invite by email; the invitee names themselves and onboards

**Context:** invitations pointed at a member row the owner had already created and named, so joining a household meant taking over a slot someone else had labelled for you.
Accepting then dropped the new person straight onto a dashboard full of the household's existing accounts, with no explanation of what the others could see and nothing of their own in it: `nextOnboardingStep` treated every non-owner as finished.

**Decision:**
- An invitation carries an email address and a role, nothing else. `household_invitations.member_id` is nullable; the member row is created by `accept_invitation_row` when the invite is accepted, named from the email's local part (de-duplicated, since `members.display_name` is unique per household) until the invitee renames it.
- Setup > Members is invite-only: no more "add a member by hand". The section lists people who have joined plus invitations still outstanding. Onboarding step 3 lost its name field the same way.
- Accepting is automatic. `?next=/invite/<token>` survives sign-up, sign-in and the email-confirmation bounce; the household is joined as soon as a session exists and the reader lands on their own onboarding. The invite card's Accept button remains only for someone who opens the link while already signed in, so a GET still never mutates.
- Onboarding has two tracks (`src/lib/onboarding.ts`). The owner keeps household → bank → invite → budget, finished by `households.onboarding_completed_at`. Someone who joins walks welcome → name → accounts, finished per member by `members.onboarded_at`, and the `(app)` gate holds them there until it is stamped.
- Accounts created during the member track are `ownership: 'member'` stamped to the invitee; the owner's first accounts stay `shared`, because a brand-new household has nobody else to assign anything to.
- `/invite/[token]/password` is gone. It only ran for logins created by `inviteUserByEmail`, which invitations stopped using when they moved to Resend.

**Considered + rejected:**
- *Keeping the explicit "Accept and join" click after sign-up*: the invitee already clicked the invitation and then proved the email; a second confirmation adds a step without adding a decision.
- *Onboarding invitees with the owner's four steps*: household, invite and budget are all household-level, and an invitee editing the household budget on their first screen is not what joining should mean.
- *Letting the owner name people and having the invitee correct it later*: the correction never happens, and the wrong name is the one the household sees in every split.
