-- Members gain an archived_at timestamp (matches categories + accounts) so
-- the Setup page can soft-delete members without dropping rows that are
-- referenced from transactions / transaction_shares / settlements.
alter table members add column archived_at timestamptz;
