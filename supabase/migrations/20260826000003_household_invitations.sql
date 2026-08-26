-- Household invitations.
--
-- An owner/admin invites an email address to take over a specific unlinked
-- member row. The raw token travels only in the link; the table stores its
-- SHA-256. Accepting (via RPC, definer) adds the login to household_users,
-- links the member and stamps the invitation. If the invitee already created
-- their own household but never used it (no accounts, no transactions, sole
-- login) that empty household is absorbed so they can join yours.

create table household_invitations (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  email         text not null check (position('@' in email) > 1),
  role          text not null default 'member' check (role in ('admin', 'member')),
  token_hash    text not null unique,
  invited_by    uuid not null references auth.users(id) on delete cascade,
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  accepted_by   uuid references auth.users(id) on delete set null,
  revoked_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index household_invitations_household_idx on household_invitations(household_id);
-- One live invite per member slot.
create unique index household_invitations_pending_member_uniq
  on household_invitations(member_id) where accepted_at is null and revoked_at is null;

alter table household_invitations enable row level security;
create policy household_invitations_select on household_invitations for select
  using (is_household_member(household_id));
create policy household_invitations_insert on household_invitations for insert
  to authenticated
  with check (
    has_household_role(household_id, array['owner', 'admin'])
    and invited_by = auth.uid()
    and exists (
      select 1 from members m
      where m.id = member_id
        and m.household_id = household_invitations.household_id
        and m.user_id is null
        and m.archived_at is null
    )
  );
create policy household_invitations_update on household_invitations for update
  using (has_household_role(household_id, array['owner', 'admin']))
  with check (has_household_role(household_id, array['owner', 'admin']));

-- Clients may revoke/extend; only the accept RPC stamps accepted_*. The hash
-- never leaves the database.
revoke select, update on household_invitations from authenticated, anon;
grant select (id, household_id, member_id, email, role, invited_by, expires_at, accepted_at, revoked_at, created_at)
  on household_invitations to authenticated;
grant update (revoked_at, expires_at) on household_invitations to authenticated;

create or replace function hash_invite_token(raw text) returns text
language sql immutable
set search_path = public, pg_temp
as $$
  select encode(extensions.digest(convert_to(raw, 'UTF8'), 'sha256'), 'hex')
$$;
revoke all on function hash_invite_token(text) from public, anon;
grant execute on function hash_invite_token(text) to authenticated;

-- Anonymous-safe preview for /invite/[token]: no ids, masked email.
create or replace function preview_household_invitation(raw_token text)
returns table (household_name text, member_name text, email_hint text, status text)
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
           m.display_name,
           regexp_replace(inv.email, '^(.).*(@.*)$', '\1***\2'),
           case
             when inv.accepted_at is not null then 'accepted'
             when inv.revoked_at is not null then 'revoked'
             when inv.expires_at < now() then 'expired'
             else 'pending'
           end
    from households h
    join members m on m.id = inv.member_id
    where h.id = inv.household_id;
end
$$;
revoke all on function preview_household_invitation(text) from public;
grant execute on function preview_household_invitation(text) to anon, authenticated;

-- Shared body for token- and id-based acceptance.
create or replace function accept_invitation_row(inv household_invitations) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  caller uuid := auth.uid();
  caller_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  other_household uuid;
begin
  if caller is null then raise exception 'not_authenticated'; end if;
  if inv.accepted_at is not null then raise exception 'already_accepted'; end if;
  if inv.revoked_at is not null then raise exception 'revoked'; end if;
  if inv.expires_at < now() then raise exception 'expired'; end if;
  if lower(inv.email) <> caller_email then raise exception 'email_mismatch'; end if;
  if exists (select 1 from members where id = inv.member_id and user_id is not null) then
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
  update members set user_id = caller where id = inv.member_id;
  update household_invitations set accepted_at = now(), accepted_by = caller where id = inv.id;
  return inv.household_id;
end
$$;
revoke all on function accept_invitation_row(household_invitations) from public, anon, authenticated;

create or replace function accept_household_invitation(raw_token text) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  inv household_invitations%rowtype;
begin
  select * into inv from household_invitations
  where token_hash = hash_invite_token(raw_token) for update;
  if inv.id is null then raise exception 'invalid_token'; end if;
  return accept_invitation_row(inv);
end
$$;
revoke all on function accept_household_invitation(text) from public, anon;
grant execute on function accept_household_invitation(text) to authenticated;

-- Invites addressed to the caller's email (for /onboarding, no token needed).
create or replace function my_pending_invitations()
returns table (id uuid, household_name text, member_name text, invited_at timestamptz)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select i.id, h.name, m.display_name, i.created_at
  from household_invitations i
  join households h on h.id = i.household_id
  join members m on m.id = i.member_id
  where lower(i.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    and i.accepted_at is null and i.revoked_at is null and i.expires_at > now()
  order by i.created_at desc
$$;
revoke all on function my_pending_invitations() from public, anon;
grant execute on function my_pending_invitations() to authenticated;

create or replace function accept_invitation_by_id(invitation_id uuid) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  inv household_invitations%rowtype;
begin
  select * into inv from household_invitations where id = invitation_id for update;
  if inv.id is null then raise exception 'invalid_token'; end if;
  return accept_invitation_row(inv);
end
$$;
revoke all on function accept_invitation_by_id(uuid) from public, anon;
grant execute on function accept_invitation_by_id(uuid) to authenticated;
