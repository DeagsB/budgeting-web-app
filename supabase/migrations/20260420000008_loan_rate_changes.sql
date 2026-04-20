-- Variable-rate loans: history of rate changes per loan. The amortisation
-- schedule looks up the applicable rate for each projected period. If no
-- rows exist for a loan, the amortisation falls back to loan_details.
-- annual_rate_bps (the initial rate).

create table loan_rate_changes (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  account_id      uuid not null references accounts(id) on delete cascade,
  effective_month date not null check (extract(day from effective_month) = 1),
  annual_rate_bps int not null check (annual_rate_bps >= 0 and annual_rate_bps <= 100000),
  note            text check (char_length(note) <= 500),
  created_at      timestamptz not null default now(),
  unique (account_id, effective_month)
);

create index loan_rate_changes_account_idx on loan_rate_changes(account_id, effective_month);

alter table loan_rate_changes enable row level security;
create policy loan_rate_changes_rw on loan_rate_changes for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
