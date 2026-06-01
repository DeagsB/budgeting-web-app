-- Web Push notifications for the installed PWA.
--   1. push_subscriptions — one row per device/browser that opted in. The
--      webhook (service role) reads these to send; members manage their own
--      via RLS.
--   2. households.notification_prefs — which events fire a push, household-wide.

-- ─── 1. push_subscriptions ───────────────────────────────────────────────

create table push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- The PushSubscription endpoint is globally unique per device+site; use it
  -- as the natural key so re-subscribing upserts instead of duplicating.
  endpoint      text not null unique,
  p256dh        text not null,
  auth          text not null,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index push_subscriptions_household_idx on push_subscriptions(household_id);

alter table push_subscriptions enable row level security;

-- Members manage their own subscriptions; the server send path uses the
-- service-role key (bypasses RLS).
create policy push_subscriptions_rw on push_subscriptions for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ─── 2. households.notification_prefs ────────────────────────────────────

alter table households
  add column notification_prefs jsonb not null default jsonb_build_object(
    'new_transaction', true,
    'large_transaction', false,
    'large_threshold_cents', 20000,
    'budget_overspend', true,
    'unmatched_alert', false
  );
