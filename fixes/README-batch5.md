# Maple — Batch 5 Ports

Reports, setup, and auth — the last screens.

---

## Reports

| This file | → | Your app path |
|---|---|---|
| `pnl-page.tsx` | → | `src/app/(app)/pnl/page.tsx` |
| `balance-sheet-page.tsx` | → | `src/app/(app)/balance-sheet/page.tsx` |
| `net-worth-page.tsx` | → | `src/app/(app)/net-worth/page.tsx` |

**P&L** — twelve bars per year (income leaf, expense maple) with month-picker arrows and clickable bars; top-categories bar list for the selected month. **Balance sheet** — big serif net-worth hero, two-column assets/liabilities ledger grouped by account type. **Net worth** — 24-month area chart with soft leaf gradient, today + YoY delta.

All three read from `accounts`, `account_snapshots`, `transactions`, `transaction_splits` — same tables the dashboard already uses. No new server actions.

---

## Setup

| This file | → | Your app path |
|---|---|---|
| `setup-page.tsx` | → | `src/app/(app)/setup/page.tsx` |
| `setup-household-form.tsx` | → | `src/app/(app)/setup/household-form.tsx` |
| `setup-members-list.tsx` | → | `src/app/(app)/setup/members-list.tsx` |
| `setup-categories-list.tsx` | → | `src/app/(app)/setup/categories-list.tsx` |

Single page, three cards: household name (click to rename), members (add / rename / archive), categories (two-level tree, rollover toggle, archive). Everything inline — no modals.

**Needs this `actions.ts` (in the same `setup/` folder):**

```ts
'use server'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getHouseholdContext } from '@/lib/household'

async function hh() {
  const ctx = await getHouseholdContext()
  return ctx ? { ctx, supabase: await createClient() } : null
}

export async function renameHousehold(fd: FormData) {
  const h = await hh(); if (!h) return
  const id = String(fd.get('id')); const name = String(fd.get('name') ?? '').trim()
  if (!id || !name) return
  await h.supabase.from('households').update({ name }).eq('id', id)
  revalidatePath('/setup')
}

export async function addMember(fd: FormData) {
  const h = await hh(); if (!h) return
  const name = String(fd.get('name') ?? '').trim()
  if (!name) return
  await h.supabase.from('members').insert({ household_id: h.ctx.householdId, display_name: name })
  revalidatePath('/setup')
}
export async function renameMember(fd: FormData) {
  const h = await hh(); if (!h) return
  await h.supabase.from('members')
    .update({ display_name: String(fd.get('name') ?? '').trim() })
    .eq('id', String(fd.get('id'))).eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
}
export async function archiveMember(fd: FormData) {
  const h = await hh(); if (!h) return
  await h.supabase.from('members').update({ archived_at: new Date().toISOString() })
    .eq('id', String(fd.get('id'))).eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
}
export async function unarchiveMember(fd: FormData) {
  const h = await hh(); if (!h) return
  await h.supabase.from('members').update({ archived_at: null })
    .eq('id', String(fd.get('id'))).eq('household_id', h.ctx.householdId)
  revalidatePath('/setup')
}

export async function addCategory(fd: FormData) {
  const h = await hh(); if (!h) return
  const name = String(fd.get('name') ?? '').trim()
  const parent_id = String(fd.get('parent_id') ?? '') || null
  if (!name) return
  await h.supabase.from('categories').insert({ household_id: h.ctx.householdId, name, parent_id })
  revalidatePath('/setup')
}
export async function renameCategory(fd: FormData) {
  const h = await hh(); if (!h) return
  await h.supabase.from('categories')
    .update({ name: String(fd.get('name') ?? '').trim() })
    .eq('id', String(fd.get('id'))).eq('household_id', h.ctx.householdId)
  revalidatePath('/setup'); revalidatePath('/budgets')
}
export async function toggleRollover(fd: FormData) {
  const h = await hh(); if (!h) return
  await h.supabase.from('categories')
    .update({ rollover_enabled: String(fd.get('rollover')) === 'true' })
    .eq('id', String(fd.get('id'))).eq('household_id', h.ctx.householdId)
  revalidatePath('/setup'); revalidatePath('/budgets')
}
export async function archiveCategory(fd: FormData) {
  const h = await hh(); if (!h) return
  await h.supabase.from('categories').update({ archived_at: new Date().toISOString() })
    .eq('id', String(fd.get('id'))).eq('household_id', h.ctx.householdId)
  revalidatePath('/setup'); revalidatePath('/budgets')
}
export async function unarchiveCategory(fd: FormData) {
  const h = await hh(); if (!h) return
  await h.supabase.from('categories').update({ archived_at: null })
    .eq('id', String(fd.get('id'))).eq('household_id', h.ctx.householdId)
  revalidatePath('/setup'); revalidatePath('/budgets')
}
```

---

## Auth

| This file | → | Your app path |
|---|---|---|
| `auth-signin-page.tsx` | → | `src/app/sign-in/page.tsx` |
| `auth-signup-page.tsx` | → | `src/app/sign-up/page.tsx` |
| `auth-check-email-page.tsx` | → | `src/app/sign-up/check-email/page.tsx` |

Uses the `signIn` / `signUp` server actions already in `refs/src/auth-actions.ts`. Drop that file at `src/app/sign-in/actions.ts` **and** `src/app/sign-up/actions.ts` (or extract into one shared module — your call). The forms look for `./actions`.

Both screens: centered maple-leaf mark, serif headline ("Welcome back." / "Plant the seed."), email + password, single submit button, cross-link at the bottom. `?next=` param is preserved through both forms.

---

## What's still missing

- Contributions / loans pages (the sidebar links I haven't touched yet)
- Transaction import wizard (there's a `tx-import-*` in refs if you want that next)
- Mobile nav drawer styling for the shell

Say which of those you want, or ship what's here.
