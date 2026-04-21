# Maple — Import Wizard port

| This file | → | Your app path |
|---|---|---|
| `tx-import-page.tsx` | → | `src/app/(app)/transactions/import/page.tsx` |
| `tx-import-wizard.tsx` | → | `src/app/(app)/transactions/import/wizard.tsx` |

Reuses your existing `./actions` (`commitImport`, `ImportState`, `StagedTx`) and `@/lib/csv` + `parseMoneyToCents` — no server changes.

## What's different vs the original

- **Stepper** — each of the four phases (Paste → Map → Preview → Commit) is a numbered card; step 1/2/3 are visible inline, step 4 only reveals once rows are ready.
- **Paste area** — monospace 12px, subtle leaf focus ring, "Try a sample →" shortcut that loads a 3-row CSV so you can test without grabbing a file. "Clear" button once there's content.
- **Mapping grid** — responsive (1 → 2 → 3 → 4 columns); labels in small caps so the column name reads clearly even when truncated. Uses `autoDetect` on every header-count change (via `useEffect`) instead of the render-time mutation the original had.
- **Preview table** — sticky header on `cream-2`, maple-soft row tint for errors, status pill per row (`Ready` in leaf, error in maple). Income rows render in leaf, outflows in maple — same signal as the transactions list.
- **Counts** — ready / with-errors badge pair in the preview header with leaf + maple dots.
- **Commit button** — single pill with the exact count: "Import 27 transactions →".

## Notes

- If you don't have `MapleLabel` yet, batch 2's `ui-label.tsx` includes it.
- `maple-input` / `maple-select` utility classes come from `globals-patch.css` (batch 2).
- The original used `autoDetect` inside render which caused a React warning; this version gates it through `useEffect`.
