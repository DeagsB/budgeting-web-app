-- Settlement periods: close the shared-expense tally on a schedule (or early),
-- notify, and settle in one tap.
--
-- Model: exactly one OPEN period per household. Closing stamps every
-- not-yet-stamped share whose transaction is dated on/before the close date
-- with the period id, marks the period closed, and opens the next one from
-- the following day. Because membership is by stamp (not by date), a share
-- that arrives late for a closed period simply lands in the open one, and a
-- share is never counted twice. Balances stored on the period are an audit
-- snapshot of what was notified, never an input to computation.

alter table households
  add column settlement_close_day int not null default 28
    check (settlement_close_day between 1 and 28);

create table settlement_periods (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  period_start  date not null,
  period_end    date,                                  -- null while open
  status        text not null default 'open' check (status in ('open', 'closed', 'settled')),
  closed_at     timestamptz,
  closed_by     uuid references members(id) on delete set null,   -- null = auto-close
  settled_at    timestamptz,
  balances      jsonb not null default '[]'::jsonb,   -- [{from_member_id,to_member_id,net_cents}]
  created_at    timestamptz not null default now(),
  unique (household_id, period_start),
  check ((status = 'open') = (period_end is null))
);
create unique index settlement_periods_one_open on settlement_periods(household_id) where status = 'open';
create index settlement_periods_household_idx on settlement_periods(household_id, period_start desc);

alter table settlement_periods enable row level security;
create policy settlement_periods_select on settlement_periods for select
  using (is_household_member(household_id));
create policy settlement_periods_update on settlement_periods for update
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
-- Inserts happen only through the RPC below / the household trigger.

alter table settlements add column period_id uuid references settlement_periods(id) on delete set null;
create index settlements_period_idx on settlements(period_id) where period_id is not null;

alter table transaction_shares add column settlement_period_id uuid references settlement_periods(id) on delete set null;
create index transaction_shares_unstamped_idx on transaction_shares(household_id) where settlement_period_id is null;

-- Every household starts with an open period. Backfill from the earliest
-- shared transaction (or this month) so history lands in the first statement.
insert into settlement_periods (household_id, period_start)
select h.id,
       coalesce(date_trunc('month', min(t.occurred_on))::date, date_trunc('month', current_date)::date)
from households h
left join transaction_shares s on s.household_id = h.id
left join transactions t on t.id = s.transaction_id
group by h.id;

create or replace function open_initial_settlement_period() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  insert into settlement_periods (household_id, period_start)
  values (new.id, date_trunc('month', current_date)::date);
  return new;
end
$$;
create trigger households_open_period after insert on households
  for each row execute function open_initial_settlement_period();

-- Atomic close: stamp, close, open next. Callable by a member (session) or
-- by the cron (service role, auth.uid() is null).
create or replace function close_settlement_period(p_household uuid, p_end date, p_closed_by uuid)
returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_open settlement_periods%rowtype;
begin
  if auth.uid() is not null and not is_household_member(p_household) then
    raise exception 'forbidden';
  end if;
  select * into v_open from settlement_periods
    where household_id = p_household and status = 'open' for update;
  if not found then raise exception 'no_open_period'; end if;
  if p_end < v_open.period_start then raise exception 'period_end_before_start'; end if;

  update transaction_shares s
     set settlement_period_id = v_open.id
    from transactions t
   where s.transaction_id = t.id
     and s.household_id = p_household
     and s.settlement_period_id is null
     and t.occurred_on <= p_end;

  update settlement_periods
     set status = 'closed', period_end = p_end, closed_at = now(), closed_by = p_closed_by
   where id = v_open.id;

  insert into settlement_periods (household_id, period_start)
  values (p_household, p_end + 1);

  return v_open.id;
end
$$;
revoke all on function close_settlement_period(uuid, date, uuid) from public, anon;
grant execute on function close_settlement_period(uuid, date, uuid) to authenticated;
