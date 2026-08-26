-- Link members to logins.
--
-- A member is the budgeting subject (a person whose money flows through the
-- household); a household_user is a login. Until now nothing tied the two
-- together, so "which member am I" was unanswerable and every login saw the
-- whole household. This migration:
--   1. adds members.user_id (one login ↔ at most one member, globally);
--   2. locks that column so only the definer RPCs below can set it;
--   3. adds the helpers per-member RLS and role checks are built on;
--   4. links every existing single-login household's owner to its first
--      member, so nobody is locked out when per-member RLS lands.
--
-- Also tightens pre-existing definer functions flagged by the Supabase
-- advisor (pinned search_path, no anonymous execute).

-- ─── 1. members.user_id ───────────────────────────────────────────────────
alter table members add column user_id uuid references auth.users(id) on delete set null;
create unique index members_user_id_uniq on members(user_id) where user_id is not null;

-- ─── 2. Column-level grants ───────────────────────────────────────────────
-- Supabase grants ALL on public tables to authenticated by default. Narrow
-- members so user_id (and anything added later) can only change through the
-- RPCs. NOTE: any future `alter table members add column` that clients must
-- write needs a matching `grant update (col)` here or in its own migration.
revoke insert, update on members from authenticated, anon;
grant insert (household_id, display_name, sort_order) on members to authenticated;
grant update (display_name, sort_order, archived_at) on members to authenticated;

-- ─── 3. Helpers ───────────────────────────────────────────────────────────

-- The member row that belongs to the calling login, or null.
create or replace function current_member_id() returns uuid
language sql stable security definer
set search_path = public, pg_temp
as $$
  select id from members where user_id = auth.uid() limit 1
$$;
revoke all on function current_member_id() from public, anon;
grant execute on function current_member_id() to authenticated;

-- Does the caller hold one of the given roles in the household?
create or replace function has_household_role(h_id uuid, roles text[]) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from household_users
    where household_id = h_id and user_id = auth.uid() and role = any(roles)
  )
$$;
revoke all on function has_household_role(uuid, text[]) from public, anon;
grant execute on function has_household_role(uuid, text[]) to authenticated;

-- Can the caller act as this member? True for their own member and for any
-- member that has no login (a child, a partner not yet invited) - those
-- members' accounts must stay visible to whoever is tracking them.
create or replace function can_access_member(m_id uuid) returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from members
    where id = m_id and (user_id is null or user_id = auth.uid())
  )
$$;
revoke all on function can_access_member(uuid) from public, anon;
grant execute on function can_access_member(uuid) to authenticated;

-- Bootstrap for a login with no member yet: claim an unlinked member of the
-- caller's own household.
create or replace function claim_member(target_member_id uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  m members%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if current_member_id() is not null then raise exception 'already_linked'; end if;
  select * into m from members where id = target_member_id for update;
  if m.id is null or not is_household_member(m.household_id) then raise exception 'not_found'; end if;
  if m.user_id is not null then raise exception 'member_already_linked'; end if;
  if m.archived_at is not null then raise exception 'member_archived'; end if;
  update members set user_id = auth.uid() where id = m.id;
end
$$;
revoke all on function claim_member(uuid) from public, anon;
grant execute on function claim_member(uuid) to authenticated;

-- Owner/admin removes another member's login (and household access) while
-- keeping their data. Cannot unlink yourself.
create or replace function unlink_member(target_member_id uuid) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  m members%rowtype;
begin
  select * into m from members where id = target_member_id for update;
  if m.id is null or not has_household_role(m.household_id, array['owner', 'admin']) then
    raise exception 'forbidden';
  end if;
  if m.user_id = auth.uid() then raise exception 'cannot_unlink_self'; end if;
  if m.user_id is not null then
    delete from household_users where household_id = m.household_id and user_id = m.user_id;
    update members set user_id = null where id = m.id;
  end if;
end
$$;
revoke all on function unlink_member(uuid) from public, anon;
grant execute on function unlink_member(uuid) to authenticated;

-- New households: the first member IS the creator.
create or replace function create_household_with_member(
  household_name text,
  member_name text
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_household_id uuid;
  caller_id uuid := auth.uid();
begin
  if caller_id is null then
    raise exception 'not authenticated';
  end if;
  if household_name is null or length(trim(household_name)) = 0 then
    raise exception 'household_name required';
  end if;
  if member_name is null or length(trim(member_name)) = 0 then
    raise exception 'member_name required';
  end if;
  if exists (select 1 from household_users where user_id = caller_id) then
    raise exception 'already_in_household';
  end if;

  insert into households (name)
  values (trim(household_name))
  returning id into new_household_id;

  insert into household_users (household_id, user_id, role)
  values (new_household_id, caller_id, 'owner');

  insert into members (household_id, display_name, sort_order, user_id)
  values (new_household_id, trim(member_name), 0, caller_id);

  perform seed_default_categories(new_household_id);

  return new_household_id;
end;
$$;
revoke all on function create_household_with_member(text, text) from public, anon;
grant execute on function create_household_with_member(text, text) to authenticated;

-- ─── 4. Backfill: single-login households → owner is the first member ─────
update members m
set user_id = hu.user_id
from (
  select household_id, min(user_id::text)::uuid as user_id
  from household_users
  group by household_id
  having count(*) = 1
) hu
where m.household_id = hu.household_id
  and m.user_id is null
  and m.id = (
    select m2.id from members m2
    where m2.household_id = m.household_id and m2.archived_at is null
    order by m2.sort_order, m2.created_at
    limit 1
  );

-- ─── 5. Advisor hygiene on pre-existing definer functions ─────────────────
alter function is_household_member(uuid) set search_path = public, pg_temp;
alter function seed_default_categories(uuid) set search_path = public, pg_temp;
alter function touch_updated_at() set search_path = public, pg_temp;
alter function rotate_email_ingest_secret(uuid) set search_path = public, pg_temp;
revoke execute on function is_household_member(uuid) from anon;
revoke execute on function seed_default_categories(uuid) from anon, authenticated;
revoke execute on function rotate_email_ingest_secret(uuid) from anon;
