-- Monthly per-account balance snapshots. Feeds the balance-sheet view
-- (workbook sheet 7) and the investment-growth views (sheets 8 + 9).
-- One row per (account, month). Balance is whatever the user enters from
-- their brokerage/bank statement for that month-end.

create table account_balance_snapshots (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id   uuid not null references accounts(id) on delete cascade,
  as_of_month  date not null check (extract(day from as_of_month) = 1),
  balance_cents bigint not null,
  note         text check (char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (account_id, as_of_month)
);

create index account_balance_snapshots_household_month_idx
  on account_balance_snapshots(household_id, as_of_month desc);
create index account_balance_snapshots_account_idx
  on account_balance_snapshots(account_id, as_of_month desc);

create trigger account_balance_snapshots_touch before update on account_balance_snapshots
  for each row execute function touch_updated_at();

alter table account_balance_snapshots enable row level security;

create policy account_balance_snapshots_rw on account_balance_snapshots for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
