-- Plaid integration: automatic, merchant-rich transaction sync.
--
-- Augments the email-alert pipeline. A Plaid transaction that matches an
-- existing email_alert row (same account, signed amount, ±5 days) UPGRADES that
-- row's generic title ("withdrawal warning") with the real merchant rather than
-- duplicating it — see src/lib/plaid-sync.ts + src/lib/statement-reconcile.ts.

-- ─── 1. Allow 'plaid' as a transaction source ─────────────────────────────
alter table transactions drop constraint transactions_source_check;
alter table transactions add constraint transactions_source_check
  check (source in ('manual', 'csv_import', 'ofx_import', 'email_alert', 'plaid'));

-- ─── 2. Plaid items (connected banks) — metadata only, member-readable ─────
create table plaid_items (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references households(id) on delete cascade,
  item_id           text not null,                  -- Plaid item_id
  institution_name  text,
  institution_id    text,
  cursor            text,                            -- /transactions/sync cursor
  status            text not null default 'active'
    check (status in ('active', 'login_required', 'error', 'removed')),
  last_synced_at    timestamptz,
  error_detail      text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (household_id, item_id)
);
create index plaid_items_household_idx on plaid_items(household_id);
create trigger plaid_items_touch before update on plaid_items
  for each row execute function touch_updated_at();

alter table plaid_items enable row level security;
create policy plaid_items_rw on plaid_items for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ─── 3. Access-token secrets — RLS ON, NO POLICY ──────────────────────────
-- No policy ⇒ no client session can ever select a row. Only the service-role
-- key (which bypasses RLS) reads it, in server-only code. The token is ALSO
-- AES-256-GCM encrypted at rest (base64 of iv||tag||ciphertext); the key lives
-- in PLAID_TOKEN_KEY, never in the DB.
create table plaid_item_secrets (
  item_id                 uuid primary key references plaid_items(id) on delete cascade,
  access_token_encrypted  text not null,
  created_at              timestamptz not null default now()
);
alter table plaid_item_secrets enable row level security;
-- Intentionally NO create policy.

-- ─── 4. Map Plaid accounts onto Maple accounts (1:1) ──────────────────────
alter table accounts
  add column plaid_account_id text,
  add column plaid_item_id    uuid references plaid_items(id) on delete set null;
create unique index accounts_plaid_account_uniq
  on accounts(household_id, plaid_account_id) where plaid_account_id is not null;
create index accounts_plaid_item_idx on accounts(plaid_item_id) where plaid_item_id is not null;

-- ─── 5. Sync log (mirrors email_ingestion_log) — member-readable ──────────
create table plaid_sync_log (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references households(id) on delete cascade,
  item_id       uuid references plaid_items(id) on delete set null,
  ran_at        timestamptz not null default now(),
  added         int not null default 0,
  modified      int not null default 0,
  removed       int not null default 0,
  reconciled    int not null default 0,
  status        text not null,   -- 'ok' | 'login_required' | 'error' | 'webhook_rejected'
  error_detail  text
);
create index plaid_sync_log_household_idx on plaid_sync_log(household_id, ran_at desc);
alter table plaid_sync_log enable row level security;
create policy plaid_sync_log_select on plaid_sync_log for select
  using (household_id is not null and is_household_member(household_id));
