-- Loan amortization metadata (workbook sheet 11). One row per loan account
-- holds the contractual terms; the amortization schedule is computed in the
-- app from these + the account's current balance snapshot.

create table loan_details (
  account_id                           uuid primary key references accounts(id) on delete cascade,
  household_id                         uuid not null references households(id) on delete cascade,
  annual_rate_bps                      int not null check (annual_rate_bps >= 0 and annual_rate_bps <= 100000),
  origination_date                     date not null,
  original_principal_cents             bigint not null check (original_principal_cents > 0),
  contractual_monthly_payment_cents    bigint not null check (contractual_monthly_payment_cents > 0),
  created_at                           timestamptz not null default now(),
  updated_at                           timestamptz not null default now()
);

create index loan_details_household_idx on loan_details(household_id);

create trigger loan_details_touch before update on loan_details
  for each row execute function touch_updated_at();

alter table loan_details enable row level security;

create policy loan_details_rw on loan_details for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
