-- Replace the permissive "auth.uid() is not null" pattern with the more
-- reliable "to authenticated" pattern. Same effect, but works consistently
-- across Supabase's PostgREST auth context.

drop policy if exists households_insert on households;
create policy households_insert on households for insert
  to authenticated
  with check (true);

drop policy if exists household_users_insert on household_users;
create policy household_users_insert on household_users for insert
  to authenticated
  with check (user_id = auth.uid() or is_household_member(household_id));
