-- CRA annual limits for TFSA + FHSA (universal, year-keyed). RRSP isn't
-- here because its annual room is income-derived per-taxpayer and comes
-- from each member's Notice of Assessment — we let the user override it
-- per-member below.

create type registered_account_type as enum ('tfsa', 'rrsp', 'fhsa');

create table cra_annual_limits (
  year int not null check (year between 2000 and 2100),
  account_type registered_account_type not null,
  annual_limit_cents bigint not null check (annual_limit_cents >= 0),
  note text,
  updated_at timestamptz not null default now(),
  primary key (year, account_type)
);

-- Seed the known recent limits. RRSP rows are still useful as a fallback
-- default (CRA's dollar ceiling: RRSP max is 18% of earned income capped by
-- a yearly dollar limit).
insert into cra_annual_limits (year, account_type, annual_limit_cents, note) values
  (2023, 'tfsa', 650000,  'CRA TFSA annual limit 2023'),
  (2024, 'tfsa', 700000,  'CRA TFSA annual limit 2024'),
  (2025, 'tfsa', 700000,  'CRA TFSA annual limit 2025'),
  (2026, 'tfsa', 700000,  'CRA TFSA annual limit 2026 (estimate, confirm)'),
  (2023, 'fhsa', 800000,  'FHSA annual contribution cap'),
  (2024, 'fhsa', 800000,  'FHSA annual contribution cap'),
  (2025, 'fhsa', 800000,  'FHSA annual contribution cap'),
  (2026, 'fhsa', 800000,  'FHSA annual contribution cap'),
  (2023, 'rrsp', 3087000, 'CRA RRSP dollar limit 2023 ($30,870)'),
  (2024, 'rrsp', 3154000, 'CRA RRSP dollar limit 2024 ($31,560)'),
  (2025, 'rrsp', 3281000, 'CRA RRSP dollar limit 2025 ($32,810)'),
  (2026, 'rrsp', 3400000, 'CRA RRSP dollar limit 2026 (estimate; replace with user-specific room)');

alter table cra_annual_limits enable row level security;
create policy cra_annual_limits_read on cra_annual_limits for select
  to authenticated using (true);


create table member_contribution_rooms (
  id                           uuid primary key default gen_random_uuid(),
  household_id                 uuid not null references households(id) on delete cascade,
  member_id                    uuid not null references members(id) on delete cascade,
  account_type                 registered_account_type not null,
  year                         int not null check (year between 2000 and 2100),
  opening_room_cents           bigint not null default 0,
  annual_allowance_override_cents bigint,
  note                         text check (char_length(note) <= 500),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),
  unique (member_id, account_type, year)
);

create index member_contribution_rooms_household_idx
  on member_contribution_rooms(household_id, year, account_type);

create trigger member_contribution_rooms_touch before update on member_contribution_rooms
  for each row execute function touch_updated_at();

alter table member_contribution_rooms enable row level security;
create policy member_contribution_rooms_rw on member_contribution_rooms for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
