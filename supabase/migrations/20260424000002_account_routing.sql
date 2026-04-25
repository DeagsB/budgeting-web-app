-- Auto-routing for email-imported transactions:
--   * accounts.last_four — 4 digits identifying this account/card in alerts.
--     Optional; an account without it can't be auto-routed to.
--   * bank_email_rules.account_router_regex — when set, the engine extracts
--     a discriminator from the email body (typically the "ending in NNNN"
--     pattern) and looks up the household's account with matching last_four.
--     Falls back to default_account_id if no match.

alter table accounts
  add column last_four text
    check (last_four is null or last_four ~ '^[0-9]{4}$');

create unique index accounts_last_four_uniq
  on accounts(household_id, last_four)
  where last_four is not null and archived_at is null;

alter table bank_email_rules
  add column account_router_regex text;
