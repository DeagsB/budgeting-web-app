-- Guided onboarding: explicit completion flag.
--
-- Before this, "onboarded" was inferred from row counts (household exists,
-- accounts > 0). The new flow has skippable steps, so the only durable fact is
-- whether the creating owner finished (or skipped out of) the guided flow.
-- The resume step is derived from DB state in src/lib/onboarding.ts.

alter table households
  add column onboarding_completed_at timestamptz;

comment on column households.onboarding_completed_at is
  'Null while the creating owner is still inside /onboarding. Set by complete_onboarding().';

-- Every household that exists today predates the guided flow; never bounce them.
update households
set onboarding_completed_at = now()
where onboarding_completed_at is null;

-- Only the owner can flip the flag, and only for their own household.
-- Security definer so it does not depend on the households UPDATE policy.
create or replace function complete_onboarding()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update households h
  set onboarding_completed_at = coalesce(h.onboarding_completed_at, now())
  from household_users hu
  where hu.household_id = h.id
    and hu.user_id = auth.uid()
    and hu.role = 'owner';
$$;

revoke all on function complete_onboarding() from public;
grant execute on function complete_onboarding() to authenticated;
