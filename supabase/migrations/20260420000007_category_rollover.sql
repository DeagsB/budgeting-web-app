-- Per-category flag: if on, unused monthly budget rolls forward into the
-- next month's effective budget. Off = budget resets each month (default).

alter table categories add column rollover_enabled boolean not null default false;
