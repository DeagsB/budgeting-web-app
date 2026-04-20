-- Atomic household-creation RPC. Bypasses RLS internally so the caller can
-- create their household + link themselves + seed categories in one shot
-- without hitting the is_household_member chicken-and-egg (the .select()
-- trailing .insert() fires the households SELECT policy, which requires the
-- user to already be a member of the household we're creating).

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

  insert into households (name)
  values (trim(household_name))
  returning id into new_household_id;

  insert into household_users (household_id, user_id, role)
  values (new_household_id, caller_id, 'owner');

  insert into members (household_id, display_name, sort_order)
  values (new_household_id, trim(member_name), 0);

  perform seed_default_categories(new_household_id);

  return new_household_id;
end;
$$;

revoke all on function create_household_with_member(text, text) from public;
grant execute on function create_household_with_member(text, text) to authenticated;
