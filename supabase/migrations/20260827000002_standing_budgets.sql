-- Budgets become standing, not monthly.
--
-- A household sets one amount per category and it applies to every month
-- until they change it. `monthly_budgets` stops being the place a budget
-- lives and becomes the exception list: a row there overrides the standing
-- amount for that single month.
--
-- Also drops per-category rollover. Carrying an unspent surplus into the next
-- month is an envelope-budgeting idea that does not fit a standing budget,
-- and the toggle read as an unexplained word next to Rename / Archive.

create table category_budgets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  category_id   uuid not null references categories(id) on delete cascade,
  amount_cents  bigint not null check (amount_cents >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (household_id, category_id)
);

create index category_budgets_household_idx on category_budgets(household_id);

create trigger category_budgets_touch before update on category_budgets
  for each row execute function touch_updated_at();

alter table category_budgets enable row level security;

create policy category_budgets_rw on category_budgets for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- Seed the standing amount from the most recent month each category was
-- budgeted in - that is the number the household last decided on.
insert into category_budgets (household_id, category_id, amount_cents)
select distinct on (household_id, category_id)
  household_id, category_id, amount_cents
from monthly_budgets
order by household_id, category_id, month desc
on conflict (household_id, category_id) do nothing;

-- The current and future months are now covered by the standing amount, so
-- leaving those rows behind would show every category as overridden. Past
-- months keep their rows: that really was the budget at the time.
delete from monthly_budgets
where month >= date_trunc('month', now())::date;

comment on table category_budgets is
  'Standing monthly budget per category. monthly_budgets overrides it for a single month.';

alter table categories drop column rollover_enabled;
