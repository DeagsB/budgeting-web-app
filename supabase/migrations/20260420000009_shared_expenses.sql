-- Per-transaction shares. One row per member who owes a portion.
-- Sum of shares for a given transaction must be <= abs(transactions.amount_cents);
-- the payer's own portion is the leftover (implicit, no row needed).
create table transaction_shares (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  member_id      uuid not null references members(id) on delete cascade,
  amount_cents   bigint not null check (amount_cents > 0),
  created_at     timestamptz not null default now(),
  unique (transaction_id, member_id)
);

create index transaction_shares_household_member_idx
  on transaction_shares(household_id, member_id);
create index transaction_shares_transaction_idx
  on transaction_shares(transaction_id);

alter table transaction_shares enable row level security;
create policy transaction_shares_rw on transaction_shares for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- Settlements: records an e-transfer / reimbursement between two members.
-- Computed "you owe" = sum of shares where (payer -> owee) minus sum of
-- settlements (owee -> payer).
create table settlements (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references households(id) on delete cascade,
  from_member_id   uuid not null references members(id) on delete cascade,
  to_member_id     uuid not null references members(id) on delete cascade,
  amount_cents     bigint not null check (amount_cents > 0),
  settled_on       date not null,
  note             text check (char_length(note) <= 500),
  created_at       timestamptz not null default now(),
  check (from_member_id <> to_member_id)
);

create index settlements_household_date_idx
  on settlements(household_id, settled_on desc);

alter table settlements enable row level security;
create policy settlements_rw on settlements for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
