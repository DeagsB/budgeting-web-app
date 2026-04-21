# Handoff: Maple — Modern UI Redesign for Budgeting Web App

## Overview

**Maple** is a full visual + interaction redesign for a Canadian household budgeting app (checking/savings, expense tracking, investments, shared expenses with a partner). The design system is warm, editorial, and iOS-native-feeling, with paired light and dark palettes and a matching desktop web shell.

This handoff covers:
- 6 mobile screens × 2 themes (light/dark) = 12 mobile artboards
- 2 desktop screens × 2 themes = 4 desktop artboards
- A shared token system (color, type, spacing, category chrome)
- Interaction specs for every animated/gestural element

---

## About the Design Files

The `.html` / `.jsx` files in this bundle are **design references**, not production code. They were built as React-in-browser prototypes with inline Babel for rapid iteration. **Do not copy the JSX verbatim** — instead, **recreate these designs in the existing Next.js 14 + TypeScript + Tailwind + Supabase codebase**, using its established patterns:

- `src/app/(app)/*` App Router routes
- Server Components + Server Actions for data
- Tailwind utility classes (the design tokens below map 1:1 to a `tailwind.config.ts` extension)
- Existing Supabase queries (accounts, transactions, budgets, investments, shared_expenses)
- shadcn/ui primitives where they already exist; build new ones in `src/components/ui/` to match

The prototypes use inline `style` objects because they have no build step; the real app should use Tailwind.

## Fidelity

**High-fidelity.** All colors, type, spacing, radii, and motion values are final. Recreate pixel-perfectly.

---

## Design Tokens

### Colors — Light ("Maple Light")

| Token | Hex | Usage |
|---|---|---|
| `cream` | `#F6F1E7` | App background |
| `cream-2` | `#EFE7D7` | Secondary surface (shell chrome) |
| `paper` | `#FFFDF7` | Card / elevated surface |
| `paper-2` | `#FBF6EA` | Sunken surface (inputs, rows) |
| `ink` | `#2B2118` | Primary text |
| `ink-2` | `#6B5F54` | Secondary text |
| `ink-3` | `#A89B8D` | Tertiary text / icons-off |
| `hair` | `rgba(94,76,58,0.12)` | Hairlines / dividers |
| `hair-2` | `rgba(94,76,58,0.06)` | Subtle dividers |
| `leaf` | `#2F6B3A` | Primary accent (Canadian forest green) |
| `leaf-soft` | `#E2EFDC` | Accent surface |
| `maple` | `#C04A2B` | Brand / signature accent (burnt maple) |
| `maple-soft` | `#F7DFD3` | Accent surface |
| `honey` | `#C28B2B` | Tertiary / cautions |
| `berry` | `#8A3A5C` | Alerts / negative |

### Colors — Dark ("Maple Dark")

| Token | Hex | Usage |
|---|---|---|
| `cream` | `#181410` | App background |
| `cream-2` | `#0F0C09` | Secondary surface |
| `paper` | `#221D18` | Card |
| `paper-2` | `#1B1712` | Sunken |
| `ink` | `#F5EFE3` | Primary text |
| `ink-2` | `#B8AA99` | Secondary |
| `ink-3` | `#7A6E62` | Tertiary |
| `hair` | `rgba(255,255,255,0.08)` | Hairline |
| `hair-2` | `rgba(255,255,255,0.04)` | Subtle hairline |
| `leaf` | `#6DBF7A` | Accent |
| `leaf-soft` | `rgba(109,191,122,0.14)` | Accent surface |
| `maple` | `#E4735A` | Brand |
| `maple-soft` | `rgba(228,115,90,0.18)` | Brand surface |
| `honey` | `#E5B05E` | Tertiary |
| `berry` | `#D37AA0` | Alerts |

### Category Colors (shared across light/dark, used in category chips)

| Category | Hex |
|---|---|
| Groceries | `#10B981` |
| Dining | `#EF4444` |
| Transport | `#F59E0B` |
| Entertainment | `#8B5CF6` |
| Utilities | `#6366F1` |
| Shopping | `#EC4899` |
| Health | `#14B8A6` |
| Income | `#2F6B3A` |

Category **tint** surfaces are these colors at ~14% alpha (dark) or a named pastel (light) — see `mCatTint()` in `maple-tokens.jsx` for the exact mapping.

### Typography

- **Sans (UI):** `"Inter Tight", -apple-system, BlinkMacSystemFont, system-ui, sans-serif` — weights 400/500/600/700/800
- **Serif (display/numbers):** `"Instrument Serif", Georgia, serif` — used for **balances, headlines, and large numerals**
- **Mono:** `"JetBrains Mono", ui-monospace, monospace` — used sparingly for tickers, CRA contribution amounts, timestamps

Scale (px, line-height):

| Role | Family | Size / LH / Weight / Tracking |
|---|---|---|
| Display balance | Serif | 56 / 1.0 / 400 / -1.4 |
| H1 (screen title) | Serif | 32 / 1.1 / 400 / -0.6 |
| H2 (section) | Sans | 18 / 1.3 / 600 / -0.2 |
| Body | Sans | 15 / 1.45 / 400 / 0 |
| Label/meta | Sans | 12 / 1.3 / 600 / 0.4 (uppercase) |
| Caption | Sans | 11 / 1.3 / 500 / 0 |

### Spacing Scale

4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 28 · 32 · 40 · 56 · 80

### Radius

- `sm` 8px — chips, small buttons
- `md` 14px — cards, inputs
- `lg` 20px — large cards, sheets
- `xl` 28px — hero cards, modals
- `full` 999px — pills

### Shadow

- `card` `0 1px 2px rgba(32,22,12,0.04), 0 4px 14px rgba(32,22,12,0.05)`
- `float` `0 20px 60px rgba(0,0,0,0.18)` (dialogs, sheets)

---

## Screens

### 1. Onboarding — 4 steps

**Purpose:** Welcome → link accounts → set budget categories → invite partner.

**Layout**
- Full-bleed cream background, 24px horizontal padding
- Animated progress dots (4 pills) at top, current step fills 32px wide, others 6px
- Step content vertically centered, serif headline + sans subtitle
- Sticky bottom area: secondary "Back" text button + primary "Continue" filled button (radius 28, height 56)

**Copy (exact)**
1. "Welcome to Maple" / "A quieter way to keep house."
2. "Link your banks" / "RBC, TD, Scotia, and every other big five. Read-only via Flinks."
3. "What matters to you?" / Chip grid of 8 categories, multi-select
4. "Bring Jordan along" / Email field + skip

**Interactions**
- Progress dots animate width over 260ms ease-out on step change
- "Continue" button has a 100ms press-state (scale 0.98, inset shadow)

---

### 2. Dashboard — Home

**Purpose:** At-a-glance net worth, month P&L, recent transactions, quick jump to any section.

**Layout (mobile, 390×844)**
- Fixed top bar (56px): avatar left, "Maple" wordmark center (serif, 20px), bell icon right
- Scrolling region:
  - **Balance card** (full-width, 24px margin, radius 20, `paper` bg)
    - "Net worth" label (12px meta) + eye toggle right
    - **$127,842.13** — serif 56px, count-up animation on mount
    - Delta pill: "+$2,104 this month" (leaf bg, 12px, radius full)
    - **Sparkline** below, 80px tall, scrubable
  - **Quick actions row** (4 icon buttons: Send, Move, Pay, Ask)
  - **Accounts** — horizontally scrolling cards (2 visible)
    - Each card 280×160, radius 20, `paper`
    - Tap flips card (600ms, preserve-3d) to reveal card number + CVV
  - **Recent activity** — 5 rows, tap row opens bottom sheet
  - **Budgets this month** — progress ring + 3 category rows

**Desktop layout** — 3-column grid (240 sidebar · 1fr main · 320 right rail). Sidebar has vertical nav. Right rail shows upcoming bills + shared balance.

**Interactions**
- Balance count-up: 1000ms ease-out from 0 to final value
- Eye icon blurs balance (filter: blur(16px)) with 200ms fade
- Sparkline scrub: touch/drag reveals a tooltip with date + value; rest of chart dims to 30% opacity
- Account card flip: 3D rotateY; back shows gradient matching card brand

---

### 3. Activity — Transaction list

**Purpose:** Review, categorize, split transactions.

**Layout**
- Segmented filter chips: `All` · `Shared` · `Amélie` · `Jordan` (64×32, radius full)
- Sticky date headers ("Today", "Yesterday", "Thu · Apr 17")
- Each row 64px:
  - 38×38 circular category badge (tint bg, ink color), first letter of merchant in serif
  - Merchant name (15/500) + category (12/500, ink-2)
  - Amount right (serif 17, negative = ink, income = leaf)
  - Optional "SPLIT" badge (leaf-soft bg)

**Interactions**
- Chip switch slides active indicator (200ms spring)
- Row enters with 40ms-staggered fade+translate (8px up)
- **Swipe left on row** reveals two 72px actions: Split (leaf) · Delete (berry)
- Tap row opens bottom sheet with full detail, map, and "Split this" CTA

---

### 4. Budgets

**Purpose:** Monthly spend vs. plan, per category, with trails.

**Layout**
- Hero progress ring (SVG, 200×200) — total spent/allocated
  - Ring stroke animates in over 900ms ease-out
  - Serif number in center: $2,847 / $4,200
- Per-category rows:
  - Color bar left (6px, category color), name, spent/allocated
  - Horizontal bar below (hairline track, filled portion)
  - **Tap row expands** (auto height, 300ms) to show 19-day spend trail as mini bar chart

---

### 5. Investments — Portfolio

**Purpose:** Track TFSA, RRSP, FHSA, non-reg; show CRA contribution room.

**Layout**
- Tabs: `Portfolio` · `Holdings` · `Activity`
- **Portfolio view:**
  - Big balance serif, delta pill
  - Timeframe chips: 1D · 1W · 1M · 3M · 1Y · ALL
  - **Scrubable area chart**, 180px tall, `leaf` stroke, leaf@12% fill
  - Allocation donut (SVG) with animated segments
  - **CRA room bars** — horizontal bars per registered account showing used vs. available, mono font for dollar amounts

**Interactions**
- Chart scrub: horizontal drag moves a vertical tracker + bubble showing value at that point
- Donut segments animate in one-by-one (80ms stagger)
- CRA bars fill left-to-right (600ms ease-out)

---

### 6. Shared expenses (with partner)

**Purpose:** See who owes whom; settle up.

**Layout**
- "Jordan owes you" / "You owe Jordan" header (serif 28, amount counts up)
- "Settle up" primary button
- List of shared transactions (same row style as Activity, with "SHARED" badge)
- Tap row → bottom sheet with:
  - Detail (merchant, date, amount)
  - Split breakdown (50/50 default, editable)
  - "Send reminder" · "Mark as settled" actions

---

## Interactions & Motion

**Easings** — match iOS:
- Standard: `cubic-bezier(0.32, 0.72, 0, 1)` (iOS default)
- Enter: `cubic-bezier(0.17, 0.84, 0.44, 1)` (springy)
- Exit: `cubic-bezier(0.4, 0, 0.68, 0)` (accelerate)

**Durations** — 180 / 260 / 400 / 600 / 900

**Stagger** — 40–80ms between list items on mount

**Bottom sheets** — slide up from bottom, 320ms; backdrop fades from 0→0.4 over same duration; drag handle at top (36×4, hair color)

**Haptic-like feedback** — on every primary button tap, apply `scale(0.98)` for 100ms

**Privacy blur** — balances blur to 16px with 200ms fade when "eye" toggle is off; this state persists in localStorage

**Pull-to-refresh** — native iOS feel on transaction list

---

## State Management

Use Server Components for initial data; Client Components only where interaction demands (charts, sheets, toggles).

**Suggested client state (Zustand or React Context):**

```ts
type UIState = {
  privacyBlur: boolean;        // persists to localStorage
  activeTheme: 'light' | 'dark';
  dashboardTimeframe: '1D' | '1W' | '1M' | '3M' | '1Y' | 'ALL';
  openSheet: { kind: 'tx' | 'shared' | null; id?: string };
}
```

**Data fetching:** Reuse existing Supabase queries. Each screen maps cleanly:
- Dashboard: `getAccounts()`, `getNetWorthSeries()`, `getRecentTransactions(limit=5)`, `getMonthBudget()`
- Activity: `getTransactions(filter, cursor)` — use infinite scroll
- Budgets: `getBudgetsForMonth()`, `getSpendTrail(categoryId, days=19)`
- Investments: `getPortfolio()`, `getAllocation()`, `getCRARoom(userId)`
- Shared: `getSharedBalance(partnerId)`, `getSharedTransactions()`

---

## Tailwind Config Addition

Add to `tailwind.config.ts`:

```ts
theme: {
  extend: {
    colors: {
      cream: { DEFAULT: '#F6F1E7', 2: '#EFE7D7' },
      paper: { DEFAULT: '#FFFDF7', 2: '#FBF6EA' },
      ink:   { DEFAULT: '#2B2118', 2: '#6B5F54', 3: '#A89B8D' },
      leaf:  { DEFAULT: '#2F6B3A', soft: '#E2EFDC' },
      maple: { DEFAULT: '#C04A2B', soft: '#F7DFD3' },
      honey: '#C28B2B',
      berry: '#8A3A5C',
      // dark equivalents under `dark:` variants — see tokens above
    },
    fontFamily: {
      sans: ['"Inter Tight"', 'system-ui', 'sans-serif'],
      serif: ['"Instrument Serif"', 'Georgia', 'serif'],
      mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
    },
    borderRadius: {
      sm: '8px', md: '14px', lg: '20px', xl: '28px',
    },
    boxShadow: {
      card: '0 1px 2px rgba(32,22,12,0.04), 0 4px 14px rgba(32,22,12,0.05)',
      float: '0 20px 60px rgba(0,0,0,0.18)',
    },
    transitionTimingFunction: {
      ios: 'cubic-bezier(0.32, 0.72, 0, 1)',
      'ios-in': 'cubic-bezier(0.17, 0.84, 0.44, 1)',
    },
  },
}
```

---

## Assets

- **Fonts:** Google Fonts — Inter Tight, Instrument Serif, JetBrains Mono. Import via `next/font/google` in `app/layout.tsx`.
- **Icons:** Use `lucide-react` (already common in shadcn setups). Specific icons used: `Eye`, `EyeOff`, `Bell`, `ArrowUpRight`, `ArrowDown`, `Send`, `ShuffleIcon`, `CreditCard`, `HelpCircle`, `ChevronRight`, `X`, `Plus`, `Check`.
- **Charts:** Recommend `visx` or hand-rolled SVG (the prototypes use hand-rolled SVG with smooth Catmull-Rom paths — see `smoothPath()` in `shared.jsx`).
- **No custom illustrations or logo assets** are required; the "Maple" wordmark is type-only (Instrument Serif, 20px, letter-spacing -0.4).

---

## Files in This Bundle

- `README.md` — this document
- `index.html` — loads the full canvas
- `app.jsx` — canvas composition
- `maple-tokens.jsx` — **theme tokens, `MapleTheme` context, `mCatTint`/`mCatInk`, animation hooks, shared `MButton`/`MCard`/`MChip` primitives** — this is the most useful reference file
- `maple-mobile.jsx` — Onboarding, Dashboard, Transactions (mobile)
- `maple-mobile-2.jsx` — Budgets, Invest, Shared (mobile)
- `maple-desktop.jsx` — Desktop Dashboard + Investments
- `shared.jsx` — DATA (mock entities), `Icon`, `fmtCAD`, `smoothPath`, `ScrollArea`
- `design-canvas.jsx` — canvas framework (not needed for implementation)
- `ios-frame.jsx` — iOS bezel chrome (not needed for implementation)

**Start with `maple-tokens.jsx`** — it defines the system. Then read a screen file to see the patterns in use.

---

## Implementation Order (suggested)

1. Tailwind config + fonts + dark mode class strategy
2. Port `MapleTheme` tokens as CSS variables (so dark mode is a class toggle on `<html>`)
3. Build primitives: `Button`, `Card`, `Chip`, `Label`, `PrivacyBlur`, `CountUp`
4. Dashboard (highest leverage — establishes all patterns)
5. Activity (adds swipe + sheet patterns)
6. Budgets, Investments, Shared (reuse the above)
7. Onboarding (isolated flow, last)
8. Desktop adapts from mobile via `md:` breakpoints + sidebar

---

## Questions for the developer

- Confirm Tailwind v3 or v4 (token syntax differs slightly)
- Confirm whether shadcn/ui is already installed and which primitives exist
- Confirm the Supabase query functions listed above already exist or need to be stubbed
