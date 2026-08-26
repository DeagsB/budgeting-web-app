-- Plaid production hardening.
--
-- 1. Pending lifecycle on transactions so a pending→posted transition MIGRATES
--    the existing row (keeping the user's category/splits/shares) instead of
--    delete+insert.
-- 2. A needs_review flag for rows the sync could not update safely (e.g. the
--    bank changed the amount on a transaction the user had already split or
--    shared).
-- 3. plaid_items: richer status vocabulary, a sync lease so overlapping runs
--    (webhook + cron + pull-to-refresh) do not race, and members can no longer
--    write the row directly - every write goes through the service role.
-- 4. plaid_sync_log: constrained status, per-run trigger, and counters for the
--    two failure modes that used to be silent.

-- ─── 1 + 2. transactions ──────────────────────────────────────────────────
alter table transactions
  add column pending boolean not null default false,
  add column plaid_pending_transaction_id text,
  add column needs_review boolean not null default false;

create index transactions_needs_review_idx
  on transactions(household_id) where needs_review;

-- ─── 3. plaid_items ───────────────────────────────────────────────────────
alter table plaid_items drop constraint plaid_items_status_check;
alter table plaid_items add constraint plaid_items_status_check
  check (status in ('active', 'login_required', 'revoked', 'pending_disconnect', 'error', 'removed'));

alter table plaid_items
  add column needs_account_review boolean not null default false,
  add column sync_lease_until timestamptz;

drop policy plaid_items_rw on plaid_items;
create policy plaid_items_select on plaid_items for select
  using (is_household_member(household_id));

-- ─── 4. plaid_sync_log ────────────────────────────────────────────────────
alter table plaid_sync_log
  add column skipped_unmapped int not null default 0,
  add column insert_failed int not null default 0,
  add column trigger text not null default 'manual'
    check (trigger in ('webhook', 'cron', 'manual', 'pull'));

alter table plaid_sync_log add constraint plaid_sync_log_status_check
  check (status in ('ok', 'login_required', 'revoked', 'transient', 'error', 'skipped_locked', 'webhook_rejected'));
