-- Household split ratio + transaction rules.
--
-- 1. members.split_weight: the household's default split is a per-member
--    weight (1/1 = 50/50, 3/2 = 60/40, 0 = never owes). Any number of
--    members; archived members are excluded at read time.
-- 2. transaction_rules: "merchant contains X [amount range] [account]
--    [direction] → share by household ratio / custom weights / not at all,
--    and/or set category". Applied to every ingest path and retroactively.
-- 3. Provenance: shares and split categories written by a rule carry the
--    rule id, so re-running never overwrites a manual edit and deleting a
--    rule can (optionally) undo exactly what it did.

-- ─── 1. Split weights ─────────────────────────────────────────────────────
alter table members add column split_weight int not null default 1 check (split_weight >= 0);
-- members has column-level grants (20260826000002); extend them.
grant update (split_weight) on members to authenticated;

-- ─── 2. Rules ─────────────────────────────────────────────────────────────
create table transaction_rules (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 80),
  enabled           boolean not null default true,
  sort_order        int not null default 0,
  -- match (normalised-contains on description; see src/lib/transaction-rules.ts)
  match_text        text not null check (char_length(match_text) between 1 and 200),
  amount_min_cents  bigint check (amount_min_cents is null or amount_min_cents >= 0),
  amount_max_cents  bigint check (amount_max_cents is null or amount_max_cents >= 0),
  account_id        uuid references accounts(id) on delete set null,
  direction         text not null default 'outflow' check (direction in ('outflow', 'inflow', 'any')),
  -- actions
  share_mode        text not null default 'household' check (share_mode in ('none', 'household', 'custom')),
  share_weights     jsonb,                -- {member_id: weight}; required iff share_mode = 'custom'
  category_id       uuid references categories(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (amount_min_cents is null or amount_max_cents is null or amount_min_cents <= amount_max_cents),
  check (share_mode <> 'custom' or share_weights is not null),
  check (share_mode <> 'none' or category_id is not null)
);
create index transaction_rules_household_idx on transaction_rules(household_id, sort_order) where enabled;
create trigger transaction_rules_touch before update on transaction_rules
  for each row execute function touch_updated_at();

alter table transaction_rules enable row level security;
create policy transaction_rules_rw on transaction_rules for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ─── 3. Provenance ────────────────────────────────────────────────────────
alter table transaction_shares add column rule_id uuid references transaction_rules(id) on delete set null;
create index transaction_shares_rule_idx on transaction_shares(rule_id) where rule_id is not null;

alter table transaction_splits add column category_rule_id uuid references transaction_rules(id) on delete set null;

-- ─── Advisor hygiene: definer functions must not be callable by anon ──────
-- (They were granted to public by default; revoking from public removes the
-- anon path while the explicit `to authenticated` grants remain.)
revoke execute on function is_household_member(uuid) from public;
revoke execute on function seed_default_categories(uuid) from public;
revoke execute on function rotate_email_ingest_secret(uuid) from public;
revoke execute on function create_household_with_member(text, text) from public;
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname = 'public' and p.proname = 'rls_auto_enable') then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end $$;
