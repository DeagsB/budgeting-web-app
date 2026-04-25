-- Auto-import groundwork:
--   1. Tag every transaction with a `source` (manual, csv_import, ofx_import,
--      email_alert) and an optional `external_id` for cross-source dedup
--      (OFX FITID, email Message-ID, etc.).
--   2. Per-household `email_ingest_secret` so a Gmail Apps Script can POST
--      bank-alert emails into /api/ingest/email without a user session.
--   3. `bank_email_rules` — user-editable regex patterns that turn an alert
--      email body into a transaction (one row per bank or alert flavour).
--   4. `email_ingestion_log` — append-only log of every webhook hit, for
--      debugging when an alert doesn't show up.

-- ─── 1. transactions: source + external_id ───────────────────────────────

alter table transactions
  add column source text not null default 'manual'
    check (source in ('manual', 'csv_import', 'ofx_import', 'email_alert')),
  add column external_id text;

-- Dedup: same (household, external_id) can never appear twice. Partial
-- index so manual entries (external_id null) don't collide.
create unique index transactions_external_id_uniq
  on transactions(household_id, external_id)
  where external_id is not null;

-- ─── 2. households: email ingest secret ──────────────────────────────────

alter table households
  add column email_ingest_secret text unique;

-- Generate / rotate a webhook secret for the current user's household.
-- Returns the plaintext secret (only time it's exposed; user must copy it).
create or replace function rotate_email_ingest_secret(h_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  new_secret text;
begin
  if not is_household_member(h_id) then
    raise exception 'Not authorized for household %', h_id using errcode = '42501';
  end if;
  -- 32 bytes → 64 hex chars. Plenty of entropy and url-safe.
  new_secret := encode(gen_random_bytes(32), 'hex');
  update households set email_ingest_secret = new_secret where id = h_id;
  return new_secret;
end;
$$;

grant execute on function rotate_email_ingest_secret(uuid) to authenticated;

-- ─── 3. bank_email_rules ────────────────────────────────────────────────

create table bank_email_rules (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references households(id) on delete cascade,
  name                  text not null check (char_length(name) between 1 and 80),
  enabled               boolean not null default true,
  -- All regex fields are JS-flavour (the Node route handler is the executor).
  -- match_from / match_subject narrow which emails this rule fires on.
  match_from            text,
  match_subject         text,
  -- amount_regex MUST contain a capture group whose first match is the dollar
  -- amount (e.g. '\$([0-9,]+\.[0-9]{2})').
  amount_regex          text not null,
  -- Optional capture group for the merchant / payee. Falls back to subject.
  description_regex     text,
  -- Optional capture group for the date (YYYY-MM-DD or M/D/YYYY); falls back
  -- to the email received_at.
  date_regex            text,
  -- Sign convention. 'outflow' = positive cents (debit/purchase); 'inflow'
  -- = negative cents (deposit/credit); 'auto' = use inflow_regex to decide.
  direction             text not null default 'outflow'
    check (direction in ('outflow', 'inflow', 'auto')),
  inflow_regex          text,  -- if matches body in 'auto' mode → inflow
  -- Defaults to apply when this rule fires.
  default_account_id    uuid references accounts(id) on delete set null,
  default_member_id     uuid references members(id) on delete set null,
  default_category_id   uuid references categories(id) on delete set null,
  sort_order            int not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index bank_email_rules_household_idx
  on bank_email_rules(household_id) where enabled = true;

create trigger bank_email_rules_touch before update on bank_email_rules
  for each row execute function touch_updated_at();

alter table bank_email_rules enable row level security;
create policy bank_email_rules_rw on bank_email_rules for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ─── 4. email_ingestion_log ─────────────────────────────────────────────

create table email_ingestion_log (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid references households(id) on delete cascade,
  received_at       timestamptz not null default now(),
  from_address      text,
  subject           text,
  message_id        text,
  matched_rule_id   uuid references bank_email_rules(id) on delete set null,
  transaction_id    uuid references transactions(id) on delete set null,
  status            text not null check (status in (
    'inserted', 'duplicate', 'no_match', 'parse_error', 'invalid_secret', 'rule_disabled'
  )),
  error_detail      text,
  raw_excerpt       text  -- first ~500 chars of body, for debugging only
);

create index email_ingestion_log_household_idx
  on email_ingestion_log(household_id, received_at desc);

alter table email_ingestion_log enable row level security;

-- Read-only for household members; the route handler writes via the service
-- role bypass (RLS doesn't apply there). No insert/update/delete policy for
-- regular users — the log is system-managed.
create policy email_ingestion_log_select on email_ingestion_log for select
  using (household_id is not null and is_household_member(household_id));
