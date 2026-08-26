-- Members without a login are visible to nobody.
--
-- Supersedes the "a member with no login is visible to whoever tracks them"
-- rule from 20260826000002. A login now sees exactly: its own member's
-- accounts and payments, joint accounts (ownership = 'shared'), and read-only
-- crossover transactions it holds a transaction_shares row for.
--
-- account_visible / tx_visible / tx_editable and every accounts / transactions
-- policy route through can_access_member, so they follow automatically.
create or replace function can_access_member(m_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from members
    where id = m_id and user_id = auth.uid()
  )
$$;

revoke all on function can_access_member(uuid) from public, anon;
grant execute on function can_access_member(uuid) to authenticated;
