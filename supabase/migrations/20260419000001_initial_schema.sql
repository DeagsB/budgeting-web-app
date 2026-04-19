-- Initial schema: households, members, accounts, categories, transactions, budgets.
-- Everything is RLS-locked on creation; Supabase auth.users is the identity root.

-- ============================================================================
-- Enums
-- ============================================================================

create type account_type as enum (
  'chequing',
  'savings',
  'tfsa',
  'rrsp',
  'fhsa',
  'crypto',
  'taxable_investment',
  'loan',
  'credit_card',
  'cash'
);

create type account_ownership as enum ('member', 'shared');

-- ============================================================================
-- Tables
-- ============================================================================

create table households (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Each auth.users row joins exactly one household (for MVP). Role determines
-- whether they can manage members/settings. Future phase: invitations.
create table household_users (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Members are the *budgeting-subject* entities — one household_user may track
-- multiple members (themselves + partner + kid). Not the same as household_users.
create table members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  display_name  text not null check (char_length(display_name) between 1 and 80),
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  unique (household_id, display_name)
);

create table accounts (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  member_id     uuid references members(id) on delete set null,
  ownership     account_ownership not null,
  type          account_type not null,
  name          text not null check (char_length(name) between 1 and 80),
  opening_balance_cents bigint not null default 0,
  currency      char(3) not null default 'CAD',
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- ownership=member requires member_id; ownership=shared allows it to be null
  constraint accounts_ownership_member_consistency check (
    (ownership = 'member' and member_id is not null)
    or (ownership = 'shared')
  )
);

create index accounts_household_idx on accounts(household_id) where archived_at is null;

-- Hierarchical categories: parent_id null = top-level. Two-level max enforced
-- at the app layer (a child cannot itself have children) for MVP.
create table categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  parent_id    uuid references categories(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  code         text not null check (code ~ '^[A-Z][A-Z0-9_.]{0,39}$'),
  sort_order   int not null default 0,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (household_id, code)
);

create index categories_parent_idx on categories(parent_id);

create table transactions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  account_id    uuid not null references accounts(id) on delete restrict,
  category_id   uuid references categories(id) on delete set null,
  member_id     uuid references members(id) on delete set null,
  occurred_on   date not null,
  amount_cents  bigint not null,  -- positive = outflow from account; negative = inflow (configurable later)
  description   text check (char_length(description) <= 500),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index transactions_household_date_idx on transactions(household_id, occurred_on desc);
create index transactions_account_idx on transactions(account_id);
create index transactions_category_idx on transactions(category_id) where category_id is not null;

-- Monthly budgets: one row per (household, category, month).
-- Month stored as the first-of-month date for easy range queries.
create table monthly_budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  category_id   uuid not null references categories(id) on delete cascade,
  month         date not null check (extract(day from month) = 1),
  amount_cents  bigint not null check (amount_cents >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, category_id, month)
);

create index monthly_budgets_household_month_idx on monthly_budgets(household_id, month);

-- ============================================================================
-- updated_at trigger
-- ============================================================================

create or replace function touch_updated_at() returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger households_touch before update on households
  for each row execute function touch_updated_at();
create trigger accounts_touch before update on accounts
  for each row execute function touch_updated_at();
create trigger transactions_touch before update on transactions
  for each row execute function touch_updated_at();
create trigger monthly_budgets_touch before update on monthly_budgets
  for each row execute function touch_updated_at();

-- ============================================================================
-- RLS: every table locks to "authenticated user is in the row's household"
-- ============================================================================

alter table households       enable row level security;
alter table household_users  enable row level security;
alter table members          enable row level security;
alter table accounts         enable row level security;
alter table categories       enable row level security;
alter table transactions     enable row level security;
alter table monthly_budgets  enable row level security;

-- Helper: is the current user in the given household?
create or replace function is_household_member(h_id uuid) returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from household_users
    where household_id = h_id and user_id = auth.uid()
  );
$$;

-- households: user can see/edit their own household rows.
create policy households_select on households for select
  using (is_household_member(id));
create policy households_update on households for update
  using (is_household_member(id));
-- Insert: any authenticated user can create a household. They must then add
-- themselves to household_users in the same transaction (enforced app-side).
create policy households_insert on households for insert
  with check (auth.uid() is not null);

-- household_users: user sees rows where they're the user OR they're already a
-- member of that household (for admin views of team members).
create policy household_users_select on household_users for select
  using (user_id = auth.uid() or is_household_member(household_id));
create policy household_users_insert on household_users for insert
  with check (user_id = auth.uid() or is_household_member(household_id));
create policy household_users_delete on household_users for delete
  using (user_id = auth.uid() or is_household_member(household_id));

-- All other household-scoped tables follow the same pattern.
create policy members_rw on members for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
create policy accounts_rw on accounts for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
create policy categories_rw on categories for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
create policy transactions_rw on transactions for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
create policy monthly_budgets_rw on monthly_budgets for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ============================================================================
-- Bootstrap: default categories for a new household
-- ============================================================================

create or replace function seed_default_categories(h_id uuid) returns void
language plpgsql security definer
as $$
begin
  insert into categories (household_id, name, code, sort_order) values
    (h_id, 'Housing',              'HOUS', 10),
    (h_id, 'Transportation',       'TRAN', 20),
    (h_id, 'Food',                 'FOOD', 30),
    (h_id, 'Health',               'HLTH', 40),
    (h_id, 'Personal',             'PERS', 50),
    (h_id, 'Subscriptions',        'SUBS', 60),
    (h_id, 'Entertainment',        'ENT',  70),
    (h_id, 'Savings contribution', 'SAVE', 80),
    (h_id, 'Taxes',                'TAX',  90),
    (h_id, 'Debt payment',         'DEBT', 100),
    (h_id, 'Miscellaneous',        'MISC', 110);
end;
$$;
