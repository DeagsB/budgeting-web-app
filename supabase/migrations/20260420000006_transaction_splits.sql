-- Transaction splits let a single transaction be allocated across multiple
-- categories (e.g. Costco run: $60 groceries + $40 household supplies).
-- Every transaction gets 1+ rows; single-category transactions are just a
-- one-row split. Sum of splits must equal transactions.amount_cents — the
-- app enforces this since DB-level cross-row constraints are awkward here.

create table transaction_splits (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  category_id    uuid references categories(id) on delete set null,
  amount_cents   bigint not null,
  sort_order     int not null default 0,
  created_at     timestamptz not null default now()
);

create index transaction_splits_transaction_idx
  on transaction_splits(transaction_id);
create index transaction_splits_household_category_idx
  on transaction_splits(household_id, category_id);

alter table transaction_splits enable row level security;

create policy transaction_splits_rw on transaction_splits for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

insert into transaction_splits (household_id, transaction_id, category_id, amount_cents, sort_order)
select household_id, id, category_id, amount_cents, 0
from transactions;

alter table transactions drop column category_id;
