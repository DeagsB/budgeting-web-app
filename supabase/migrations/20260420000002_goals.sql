-- Goals / purchase tracker (workbook sheet 10). Generic — not just vehicles.
-- User enters a target amount, current progress, and optional target date.
-- Optionally links to a funding account for context.

create table goals (
  id                  uuid primary key default gen_random_uuid(),
  household_id        uuid not null references households(id) on delete cascade,
  name                text not null check (char_length(name) between 1 and 120),
  target_amount_cents bigint not null check (target_amount_cents > 0),
  current_amount_cents bigint not null default 0 check (current_amount_cents >= 0),
  target_date         date,
  funding_account_id  uuid references accounts(id) on delete set null,
  note                text check (char_length(note) <= 1000),
  achieved_at         timestamptz,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index goals_household_idx on goals(household_id) where archived_at is null;

create trigger goals_touch before update on goals
  for each row execute function touch_updated_at();

alter table goals enable row level security;

create policy goals_rw on goals for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
