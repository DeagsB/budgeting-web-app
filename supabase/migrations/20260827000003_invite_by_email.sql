-- Invite by email; the invitee names themselves.
--
-- Before: the owner created a member row ("Sam"), then invited an email to
-- take it over. The owner was naming someone else, and every invite needed a
-- spare slot to point at.
--
-- After: an invitation carries an email and a role, nothing else.
-- `member_id` stays for the invitations that already exist, but new ones
-- leave it null and the member row is created when the invite is accepted,
-- named from the email until the invitee picks their own name during their
-- onboarding.

alter table household_invitations alter column member_id drop not null;

-- One live invite per email address per household (was: per member slot).
-- The old index still applies to legacy slot-based invites; null member_ids
-- do not collide with each other.
create unique index household_invitations_pending_email_uniq
  on household_invitations (household_id, lower(email))
  where accepted_at is null and revoked_at is null;

-- Insert: a slot-less invite only needs the caller to be owner/admin. A
-- slot-based one keeps the old requirement that the slot is free.
drop policy household_invitations_insert on household_invitations;
create policy household_invitations_insert on household_invitations for insert
  to authenticated
  with check (
    has_household_role(household_id, array['owner', 'admin'])
    and invited_by = auth.uid()
    and (
      member_id is null
      or exists (
        select 1 from members m
        where m.id = member_id
          and m.household_id = household_invitations.household_id
          and m.user_id is null
          and m.archived_at is null
      )
    )
  );

-- Members walk their own short onboarding after accepting. Owners are tracked
-- by households.onboarding_completed_at; this is the per-member equivalent.
alter table members add column onboarded_at timestamptz;
comment on column members.onboarded_at is
  'When this member finished their own onboarding. Null means they still have steps to walk.';
-- Everyone who already has a login is past it.
update members set onboarded_at = now() where user_id is not null;
grant update (onboarded_at) on members to authenticated;

-- Preview now names the person who sent the invite, not the slot it points at.
drop function if exists preview_household_invitation(text);
create function preview_household_invitation(raw_token text)
returns table (household_name text, inviter_name text, email_hint text, status text)
language plpgsql stable security definer
set search_path = public, pg_temp
as $$
declare
  inv household_invitations%rowtype;
begin
  if raw_token is null or length(raw_token) < 16 then return; end if;
  select * into inv from household_invitations where token_hash = hash_invite_token(raw_token);
  if inv.id is null then return; end if;
  return query
    select h.name,
           (select m.display_name from members m
             where m.household_id = inv.household_id and m.user_id = inv.invited_by
             limit 1),
           regexp_replace(inv.email, '^(.).*(@.*)$', '\1***\2'),
           case
             when inv.accepted_at is not null then 'accepted'
             when inv.revoked_at is not null then 'revoked'
             when inv.expires_at < now() then 'expired'
             else 'pending'
           end
    from households h
    where h.id = inv.household_id;
end
$$;
revoke all on function preview_household_invitation(text) from public;
grant execute on function preview_household_invitation(text) to anon, authenticated;

-- Pending invites for the caller's email, shown on /onboarding. Left join so
-- a slot-less invitation still lists.
create or replace function my_pending_invitations()
returns table (id uuid, household_name text, member_name text, invited_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select i.id, h.name, m.display_name, i.created_at
  from household_invitations i
  join households h on h.id = i.household_id
  left join members m on m.id = i.member_id
  where lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  order by i.created_at desc
$$;
revoke all on function my_pending_invitations() from public, anon;
grant execute on function my_pending_invitations() to authenticated;

-- Accepting a slot-less invitation creates the member row. The name is taken
-- from the email and de-duplicated against the household, because
-- members.display_name is unique per household; the invitee renames it in
-- their onboarding.
create or replace function accept_invitation_row(inv household_invitations) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  other_household uuid;
  target_member uuid := inv.member_id;
  base_name text;
  try_name text;
  n int := 1;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if inv.accepted_at is not null then raise exception 'already_accepted'; end if;
  if inv.revoked_at is not null then raise exception 'revoked'; end if;
  if inv.expires_at < now() then raise exception 'expired'; end if;
  if lower(inv.email) <> caller_email then raise exception 'email_mismatch'; end if;
  if target_member is not null
     and exists (select 1 from members where id = target_member and user_id is not null) then
    raise exception 'member_already_linked';
  end if;

  -- Already somewhere else? Absorb an untouched household, refuse a used one.
  select household_id into other_household
  from household_users where user_id = caller and household_id <> inv.household_id
  limit 1;
  if other_household is not null then
    if exists (select 1 from household_users where household_id = other_household and user_id <> caller)
       or exists (select 1 from accounts where household_id = other_household)
       or exists (select 1 from transactions where household_id = other_household)
    then
      raise exception 'already_in_household';
    end if;
    delete from households where id = other_household; -- cascades members/categories/etc.
  end if;

  insert into household_users (household_id, user_id, role)
  values (inv.household_id, caller, inv.role)
  on conflict (household_id, user_id) do update set role = excluded.role;

  if target_member is null then
    -- Already in this household (re-invited, or invited twice)? Keep the
    -- member row they already have rather than making a second one.
    select id into target_member
    from members
    where household_id = inv.household_id and user_id = caller
    limit 1;
  end if;

  if target_member is null then
    base_name := nullif(split_part(inv.email, '@', 1), '');
    if base_name is null then base_name := 'Member'; end if;
    base_name := left(base_name, 76);
    try_name := base_name;
    while exists (
      select 1 from members m where m.household_id = inv.household_id and m.display_name = try_name
    ) loop
      n := n + 1;
      try_name := base_name || ' ' || n;
    end loop;

    insert into members (household_id, display_name, sort_order, user_id)
    values (
      inv.household_id,
      try_name,
      coalesce((select max(sort_order) + 1 from members where household_id = inv.household_id), 0),
      caller
    )
    returning id into target_member;
  else
    update members set user_id = caller where id = target_member;
  end if;

  update household_invitations
    set accepted_at = now(), accepted_by = caller, member_id = target_member
    where id = inv.id;
  return inv.household_id;
end
$$;
revoke all on function accept_invitation_row(household_invitations) from public, anon, authenticated;
