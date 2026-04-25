-- Stores the Apps Script Web App deployment URL so the app can trigger
-- Gmail polling on demand (e.g. user just bought something and wants the
-- transaction now, not at the next hourly tick).
--
-- The URL itself is the secret — anyone with it can hit /exec on the
-- script and cause it to process the bank-alerts label. That's fine: the
-- worst case is duplicate-detection rejecting already-imported messages.
-- Real auth still happens at /api/ingest/email via SECRET.

alter table households
  add column gmail_sync_url text;
