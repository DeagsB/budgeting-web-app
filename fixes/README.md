# Maple — Dashboard + Shell fix pack

This folder contains two **drop-in replacement** files that fix the quality gap vs. the prototype. Copy them over the existing files and verify.

## What changed & why

### `shell.tsx` (replaces `src/app/(app)/shell.tsx`)
The previous shell used raw Tailwind neutrals (`bg-gray-50`, `bg-white/95`, `text-gray-900`). Those are invisible to `.dark` class toggling and clash with the Maple cream/paper palette, so the chrome looked like scaffolding bolted onto a styled page.

**New behaviour:**
- **Desktop** (md+): fixed **left sidebar** (240px) with serif "Maple" wordmark, household name, grouped nav (Primary / Reports / Setup), and user/sign-out at the bottom.
- **Mobile** (<md): minimal top bar with wordmark + round hamburger button; full-bleed slide-down sheet for the menu.
- Every color is a `var(--color-*)` token — flips correctly in dark mode.

### `dashboard/client.tsx` (replaces `src/app/(app)/dashboard/client.tsx`)
Four concrete fixes:

1. **Hero card is no longer a solid green block.** It's now a `paper`-surfaced cream card with the balance in `ink` serif and a delicate `leaf` area chart beneath — matching the prototype. The previous "green gradient hero" used `leaf-deep` as both the background and the chart stroke, making the chart invisible.
2. **Real money formatting on the hero.** Uses the full CAD formatter (`$2,502.13`) instead of `fmtCADshort` (`$2.50K`). The compact formatter is for axis labels, not primary balances.
3. **Range selector moved to a proper pill group** (segmented, paper-2 track with active pill) and is inline with the balance on desktop, below on mobile — no more full-width button row overlaying the chart.
4. **Removed the decorative SVG "star" glyph.** It was AI-slop decoration not present in the spec.

Also refined: larger avatar stack, member initials on leaf / maple / butter tints, delta pill uses `leaf-soft` (up) or `maple-soft` (down) surfaces, card-flip backs use a branded gradient with a mono "•••• 1234" treatment.

## How to apply

```bash
# from the repo root
cp fixes/shell.tsx src/app/\(app\)/shell.tsx
cp fixes/dashboard-client.tsx src/app/\(app\)/dashboard/client.tsx
```

No other files need to change. The component props contract is unchanged — `page.tsx` continues to feed the same data.

## Verify

1. `npm run dev`
2. Visit `/dashboard` — the hero should be **cream paper with a dark serif number and a visible green area chart beneath**. No solid green block.
3. Toggle the eye icon — balances should blur/unblur smoothly.
4. Drag across the chart — a vertical tracker should follow the pointer and show the scrubbed month's value in the hero number.
5. Tap an account card — it should flip 3D to a dark green back with mono card digits.
6. Toggle `.dark` on `<html>` (or OS dark mode) — the shell, hero, stat tiles, and cards should all flip to warm espresso.

## If anything still looks off

Don't reinterpret the design — **screenshot the result and compare pixel-for-pixel against `design_handoff_maple/index.html`** (open that file in a browser). Every number, color, and spacing value in these files is deliberate. If a Tailwind class doesn't resolve, check that `globals.css` has the `@theme inline` block defining that color var.
