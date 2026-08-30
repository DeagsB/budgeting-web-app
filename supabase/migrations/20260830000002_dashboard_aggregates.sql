-- Dashboard aggregates: replace the two heaviest dashboard reads - every
-- transaction row up to the current month (limit 20000) and every split ever
-- recorded - with two server-side aggregates.
--
-- Both functions are SECURITY INVOKER on purpose: they read transactions and
-- transaction_splits under the caller's own RLS, so they see exactly the rows
-- the old client-side queries saw.

-- Per-account, per-month net transaction effect, split into "on the 1st" and
-- "rest of the month". The client rebuilds running balances by replaying
-- these against snapshots with the existing balance logic: a snapshot anchor
-- dated YYYY-MM-01 excludes transactions dated on/before the 1st of that
-- month, so the 1st-of-month sum has to travel separately from the rest.
create or replace function dashboard_balance_facts(h_id uuid, up_to date)
returns table (
  account_id uuid,
  month date,
  net_cents bigint,
  first_day_net_cents bigint
)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select
    t.account_id,
    date_trunc('month', t.occurred_on)::date as month,
    sum(t.amount_cents)::bigint as net_cents,
    coalesce(sum(t.amount_cents) filter (where extract(day from t.occurred_on) = 1), 0)::bigint
      as first_day_net_cents
  from transactions t
  where t.household_id = h_id
    and t.occurred_on < up_to
  group by t.account_id, date_trunc('month', t.occurred_on)
$$;
revoke all on function dashboard_balance_facts(uuid, date) from public, anon;
grant execute on function dashboard_balance_facts(uuid, date) to authenticated;

-- Household-wide "to categorize" summary. Mirrors computeInboxSummary in
-- src/app/(app)/dashboard/inbox.ts:
--   * only transactions the caller can edit (tx_editable: own/joint account,
--     or the caller paid it),
--   * transfer legs never count (the pair explains them, not a category),
--   * uncategorized = at most one split and no split with a category.
create or replace function dashboard_inbox_summary(h_id uuid, current_month date)
returns table (
  tx_count bigint,
  amount_cents bigint,
  account_count bigint,
  has_earlier_months boolean
)
language sql stable security invoker
set search_path = public, pg_temp
as $$
  select
    count(*)::bigint as tx_count,
    coalesce(sum(abs(t.amount_cents)), 0)::bigint as amount_cents,
    count(distinct t.account_id)::bigint as account_count,
    coalesce(bool_or(t.occurred_on < current_month), false) as has_earlier_months
  from transactions t
  where t.household_id = h_id
    and tx_editable(t.account_id, t.member_id)
    and not exists (
      select 1 from transfers tr
      where tr.out_transaction_id = t.id or tr.in_transaction_id = t.id
    )
    and (select count(*) from transaction_splits s where s.transaction_id = t.id) <= 1
    and not exists (
      select 1 from transaction_splits s
      where s.transaction_id = t.id and s.category_id is not null
    )
$$;
revoke all on function dashboard_inbox_summary(uuid, date) from public, anon;
grant execute on function dashboard_inbox_summary(uuid, date) to authenticated;

-- The aggregate scans by household + date; both already covered by
-- transactions_household_idx / occurred_on ordering, but make the common
-- filter explicit.
create index if not exists transactions_household_occurred_idx
  on transactions (household_id, occurred_on);
