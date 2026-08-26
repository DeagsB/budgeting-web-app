-- Private-by-default per-member row security.
--
-- Rule: a login sees household-level things (household, members, categories,
-- budgets, settlements, rules, connections) plus the money that is theirs:
--   account visible  ⇔ shared account, OR owned by a member the caller can act
--                       as (own member, or a member with no login);
--   transaction visible ⇔ its account is visible, OR its payer is such a
--                       member, OR the caller's member has a share of it;
--   shares / splits / snapshots / loan rows inherit from their parent.
--
-- The cross-table checks live in SECURITY DEFINER helpers so no policy ever
-- re-enters another table's policy (transactions ↔ transaction_shares would
-- otherwise recurse). Service-role code (Plaid sync, email ingest, cron)
-- bypasses RLS and is unaffected.

-- ─── Helpers ──────────────────────────────────────────────────────────────

create or replace function account_visible(a_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from accounts a
    where a.id = a_id
      and is_household_member(a.household_id)
      and (a.ownership = 'shared' or (a.member_id is not null and can_access_member(a.member_id)))
  )
$$;
revoke all on function account_visible(uuid) from public, anon;
grant execute on function account_visible(uuid) to authenticated;

-- Visibility from the transaction's own columns (no extra lookup of the row).
create or replace function tx_visible(a_id uuid, payer_id uuid, tx_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select account_visible(a_id)
      or (payer_id is not null and can_access_member(payer_id))
      or exists (
        select 1 from transaction_shares s
        join members m on m.id = s.member_id
        where s.transaction_id = tx_id and m.user_id = auth.uid()
      )
$$;
revoke all on function tx_visible(uuid, uuid, uuid) from public, anon;
grant execute on function tx_visible(uuid, uuid, uuid) to authenticated;

-- Edit rights exclude share-only visibility: seeing a bill you owe part of
-- does not let you rewrite it.
create or replace function tx_editable(a_id uuid, payer_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select account_visible(a_id) or (payer_id is not null and can_access_member(payer_id))
$$;
revoke all on function tx_editable(uuid, uuid) from public, anon;
grant execute on function tx_editable(uuid, uuid) to authenticated;

create or replace function can_see_transaction(tx_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from transactions t
    where t.id = tx_id and is_household_member(t.household_id)
      and tx_visible(t.account_id, t.member_id, t.id)
  )
$$;
revoke all on function can_see_transaction(uuid) from public, anon;
grant execute on function can_see_transaction(uuid) to authenticated;

create or replace function can_edit_transaction(tx_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from transactions t
    where t.id = tx_id and is_household_member(t.household_id)
      and tx_editable(t.account_id, t.member_id)
  )
$$;
revoke all on function can_edit_transaction(uuid) from public, anon;
grant execute on function can_edit_transaction(uuid) to authenticated;

-- ─── Indexes the new predicates lean on ───────────────────────────────────
create index if not exists accounts_member_idx on accounts(member_id) where member_id is not null;
create index if not exists transactions_member_idx on transactions(member_id) where member_id is not null;
create index if not exists transaction_shares_member_idx on transaction_shares(member_id);

-- ─── accounts ─────────────────────────────────────────────────────────────
drop policy accounts_rw on accounts;
create policy accounts_select on accounts for select
  using (is_household_member(household_id)
         and (ownership = 'shared' or (member_id is not null and can_access_member(member_id))));
create policy accounts_insert on accounts for insert to authenticated
  with check (is_household_member(household_id)
              and (ownership = 'shared' or (member_id is not null and can_access_member(member_id))));
create policy accounts_update on accounts for update
  using (is_household_member(household_id)
         and (ownership = 'shared' or (member_id is not null and can_access_member(member_id))))
  with check (is_household_member(household_id)
              and (ownership = 'shared' or (member_id is not null and can_access_member(member_id))));
create policy accounts_delete on accounts for delete
  using (is_household_member(household_id)
         and (ownership = 'shared' or (member_id is not null and can_access_member(member_id))));

-- ─── transactions ─────────────────────────────────────────────────────────
drop policy transactions_rw on transactions;
create policy transactions_select on transactions for select
  using (is_household_member(household_id) and tx_visible(account_id, member_id, id));
create policy transactions_insert on transactions for insert to authenticated
  with check (is_household_member(household_id) and tx_editable(account_id, member_id));
create policy transactions_update on transactions for update
  using (is_household_member(household_id) and tx_editable(account_id, member_id))
  with check (is_household_member(household_id) and tx_editable(account_id, member_id));
create policy transactions_delete on transactions for delete
  using (is_household_member(household_id) and tx_editable(account_id, member_id));

-- ─── transaction_shares ───────────────────────────────────────────────────
drop policy transaction_shares_rw on transaction_shares;
create policy transaction_shares_select on transaction_shares for select
  using (is_household_member(household_id) and can_see_transaction(transaction_id));
create policy transaction_shares_insert on transaction_shares for insert to authenticated
  with check (is_household_member(household_id) and can_edit_transaction(transaction_id));
create policy transaction_shares_update on transaction_shares for update
  using (is_household_member(household_id) and can_edit_transaction(transaction_id))
  with check (is_household_member(household_id) and can_edit_transaction(transaction_id));
create policy transaction_shares_delete on transaction_shares for delete
  using (is_household_member(household_id) and can_edit_transaction(transaction_id));

-- ─── transaction_splits ───────────────────────────────────────────────────
drop policy transaction_splits_rw on transaction_splits;
create policy transaction_splits_select on transaction_splits for select
  using (is_household_member(household_id) and can_see_transaction(transaction_id));
create policy transaction_splits_insert on transaction_splits for insert to authenticated
  with check (is_household_member(household_id) and can_edit_transaction(transaction_id));
create policy transaction_splits_update on transaction_splits for update
  using (is_household_member(household_id) and can_edit_transaction(transaction_id))
  with check (is_household_member(household_id) and can_edit_transaction(transaction_id));
create policy transaction_splits_delete on transaction_splits for delete
  using (is_household_member(household_id) and can_edit_transaction(transaction_id));

-- ─── account children: snapshots, loan details, rate changes ──────────────
drop policy account_balance_snapshots_rw on account_balance_snapshots;
create policy account_balance_snapshots_rw on account_balance_snapshots for all
  using (is_household_member(household_id) and account_visible(account_id))
  with check (is_household_member(household_id) and account_visible(account_id));

drop policy loan_details_rw on loan_details;
create policy loan_details_rw on loan_details for all
  using (is_household_member(household_id) and account_visible(account_id))
  with check (is_household_member(household_id) and account_visible(account_id));

drop policy loan_rate_changes_rw on loan_rate_changes;
create policy loan_rate_changes_rw on loan_rate_changes for all
  using (is_household_member(household_id) and account_visible(account_id))
  with check (is_household_member(household_id) and account_visible(account_id));

-- ─── push_subscriptions: strictly per login ───────────────────────────────
drop policy push_subscriptions_rw on push_subscriptions;
create policy push_subscriptions_rw on push_subscriptions for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and is_household_member(household_id));

-- ─── Backfill: legacy null payers on member-owned accounts ────────────────
update transactions t
set member_id = a.member_id
from accounts a
where a.id = t.account_id
  and a.ownership = 'member'
  and t.member_id is null;
