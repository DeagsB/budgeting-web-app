-- Who linked each bank.
--
-- "Needs reconnecting" is a personal errand, not household news: update-mode
-- Link asks for the bank's own credentials, so only the person who linked the
-- item can finish it. plaid_items kept no record of who that was, so every
-- member of the household saw (and could not act on) every reconnect prompt.
--
-- linked_by_user_id is nullable on purpose:
--   * Items linked before this migration have no known owner. Null keeps
--     today's household-wide behaviour for them rather than hiding a broken
--     connection from everyone and letting the sync rot unnoticed.
--   * `on delete set null` means a bank whose linker left the household falls
--     back to being everyone's problem instead of nobody's.
-- completeReauth() claims an unowned item for whoever repairs it, so the
-- pre-existing nulls heal the first time each bank is reconnected.

alter table plaid_items
  add column linked_by_user_id uuid references auth.users(id) on delete set null;

create index plaid_items_linked_by_idx
  on plaid_items(linked_by_user_id) where linked_by_user_id is not null;

comment on column plaid_items.linked_by_user_id is
  'Login that linked this bank. Only this user is prompted to reconnect it; null means unknown owner, and every member is prompted.';
