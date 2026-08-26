-- Settlement detection: a payment between members shows up on the payer's
-- (and the recipient's) ledger, so the app records it from there instead of
-- asking for a form.
--
-- 1. transaction_rules.is_settlement: "this merchant is a payment between
--    members" (e.g. INTERAC e-Transfer). A settlement rule never shares.
-- 2. settlements.paid_transaction_id / received_transaction_id: the ledger
--    rows that evidence a settlement. Null = recorded by hand or by "Mark
--    settled". Deleting the ledger row detaches; the money still moved.
-- 3. transactions.settlement_ignored: the "Not a payment" answer, so a
--    candidate stops reappearing.

alter table transaction_rules
  add column is_settlement boolean not null default false;

-- The original check was unnamed; find it by definition and replace it.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'transaction_rules'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%share_mode <> ''none''%'
      and pg_get_constraintdef(oid) like '%category_id IS NOT NULL%'
      and pg_get_constraintdef(oid) not like '%is_settlement%'
  loop
    execute format('alter table transaction_rules drop constraint %I', c.conname);
  end loop;
end $$;
alter table transaction_rules
  add constraint transaction_rules_action_check
    check (share_mode <> 'none' or category_id is not null or is_settlement),
  add constraint transaction_rules_settlement_no_share_check
    check (not is_settlement or share_mode = 'none');

alter table settlements
  add column paid_transaction_id uuid unique references transactions(id) on delete set null,
  add column received_transaction_id uuid unique references transactions(id) on delete set null;

alter table transactions
  add column settlement_ignored boolean not null default false;
