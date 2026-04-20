-- Per-member, per-month time-off tracking (workbook sheet 2: Vacation + FLEX).
-- Hours stored as numeric(10,2) so fractional hours work without float drift.

create table time_off_entries (
  id                      uuid primary key default gen_random_uuid(),
  household_id            uuid not null references households(id) on delete cascade,
  member_id               uuid not null references members(id) on delete cascade,
  period_month            date not null check (extract(day from period_month) = 1),
  vacation_accrued_hours  numeric(10, 2) not null default 0 check (vacation_accrued_hours >= 0),
  vacation_used_hours     numeric(10, 2) not null default 0 check (vacation_used_hours >= 0),
  flex_accrued_hours      numeric(10, 2) not null default 0 check (flex_accrued_hours >= 0),
  flex_used_hours         numeric(10, 2) not null default 0 check (flex_used_hours >= 0),
  note                    text check (char_length(note) <= 500),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (member_id, period_month)
);

create index time_off_entries_household_month_idx
  on time_off_entries(household_id, period_month desc);

create trigger time_off_entries_touch before update on time_off_entries
  for each row execute function touch_updated_at();

alter table time_off_entries enable row level security;

create policy time_off_entries_rw on time_off_entries for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
