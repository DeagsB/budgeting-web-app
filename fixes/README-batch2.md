# Maple — Onboarding + Shared fix pack (batch 2)

Five **drop-in replacements** that port the onboarding flow and the Shared Expenses page to the Maple design system. Server actions and data contracts are unchanged — these are purely UI/UX replacements.

## Files in this pack

| Fix file | Replaces |
|---|---|
| `onboarding-page.tsx` | `src/app/onboarding/page.tsx` |
| `onboarding-form.tsx` | `src/app/onboarding/form.tsx` |
| `shared-page.tsx` | `src/app/(app)/shared/page.tsx` |
| `shared-row.tsx` | `src/app/(app)/shared/row.tsx` |
| `shared-bulk-actions.tsx` | `src/app/(app)/shared/bulk-actions.tsx` |

## What changed & why

### Onboarding
The old onboarding was a single `max-w-md` column on a plain background with gray inputs — it felt like a dev stub. The new version is a **two-column welcome canvas**: a brand panel on the left (wordmark + big serif headline + warm radial wash) and a paper-surfaced form card on the right.

- **Live preview pill** at the top of the form mirrors what the user is typing — household name + first-initial avatar in a leaf-soft circle — so they can *see* the household they're creating before they submit.
- Inputs use the shared Maple input style (rounded 12px, hair border, leaf-soft focus ring).
- Submit is a pill button with an arrow glyph and disables until both fields are non-empty (in addition to the server-side validation already there).
- Kept `useActionState` + `createHousehold` exactly as-is; error banner is restyled into a maple-soft badge.

### Shared
The old page was functional but visually flat (gray borders, hash-decorated H2s, raw red text for debts). The port turns it into a Maple-branded surface while preserving every feature:

- **Page header** uses the ink serif headline pattern ("Split fairly. Settle quickly.") with an eyebrow label.
- **Month navigation** moved into a rounded pill nav (prev / this month / next) for a lighter touch.
- **Source-account selector** lives in its own paper card alongside bulk actions; the select is a proper Maple-styled control.
- **Stat tiles** now match the dashboard tiles — one of them shows a thin **progress bar** for "Flagged as shared" so you can eyeball completion at a glance.
- **Net-balance section** renders each debt as its own rounded row with a maple-soft pill for the amount, and a contextual link to Settlements.
- **Transactions list** uses the rest of the app's list-row grammar: hair dividers, serif tabular amounts, eyebrow label header with an "X/Y shared" counter.
- **Rows**: the checkbox is now a leaf-filled tick with the real check glyph (no text "✓"). Split metadata shows as a leaf-soft pill ("Split 3-way") rather than plain text. Edit/Clear are the standard underline-on-hover links.
- **Split editor**: the previously unstyled gray form now has a header with title, total (serif), payer-keeps line, a live **progress bar** that goes maple-red when it overshoots, and share inputs that each have a `$` glyph + right-aligned serif tabular number. Overshoot warning is a maple-soft banner. Save/Cancel use the standard pill + text-link pattern.
- **Bulk actions** are rounded pills with a check glyph on "Share all unflagged" and maple text treatment on the destructive one.

## Apply

```bash
cp fixes/onboarding-page.tsx        src/app/onboarding/page.tsx
cp fixes/onboarding-form.tsx        src/app/onboarding/form.tsx
cp fixes/shared-page.tsx            src/app/\(app\)/shared/page.tsx
cp fixes/shared-row.tsx             src/app/\(app\)/shared/row.tsx
cp fixes/shared-bulk-actions.tsx    src/app/\(app\)/shared/bulk-actions.tsx
```

No server action changes, no new deps.

## Verify

1. **Onboarding**: sign out → delete your household row (or use a new account) → hit `/onboarding`. You should see the two-column welcome with the live avatar preview updating as you type. Empty submit is disabled; submit with a name and you get redirected to `/dashboard`.
2. **Shared**: visit `/shared`. Header should be a serif headline, month nav pills, stat tiles with a progress bar on "Flagged", net-balance rows using maple-soft pills, and transaction rows with leaf-filled tick boxes. Click "Edit split" — the editor should show a progress bar that turns maple when overshooting.
3. **Dark mode** (if enabled): toggle `.dark` on `<html>` — every surface should flip to warm espresso cleanly since only `var(--color-*)` tokens are used.

## Next up

After you confirm: I'll port **transactions**, **budgets**, **settlements**, **accounts**, **pnl**, **balance-sheet**, **goals**, **loans**, **contributions**, **time-off**, **members**, **categories**, **settings**. Say the word and I'll pick the next screen.
