-- Transfers between the household's own accounts.
--
-- Money moving chequing -> Visa or chequing -> TFSA lands as two ledger rows
-- (an outflow and an inflow). A `transfers` row pairs them so reports treat
-- the pair as neither income nor expense. Balances, net worth and
-- contributions are untouched: the money really moved.
--
-- Shape: one row per pair with two NOT NULL unique legs, not a nullable
-- transactions.transfer_id. Exactly-two by construction; ON DELETE CASCADE
-- frees the surviving leg when Plaid hard-deletes one; and "Not a transfer"
-- is a single DELETE that a login who can edit only ONE leg can still make
-- (a column on both legs would leave the partner's private leg half-linked
-- under per-member RLS, because transactions_update needs tx_editable on
-- every row it touches).
--
-- Orientation is an invariant, not a convention: out_transaction_id is the
-- outflow (amount_cents > 0), in_transaction_id the inflow (< 0). A row has
-- one sign, so the two unique constraints together mean it is a leg of at
-- most one pair.
--
-- No column-level grants are needed: transactions and households carry the
-- default grants (only members / household_invitations are narrowed), and
-- transfer_ignored mirrors settlement_ignored, which the session client
-- already writes.

-- ─── 1. transactions: the "Not a transfer" answer + Plaid's own category ──
alter table transactions
  add column transfer_ignored boolean not null default false,
  add column plaid_pfc_primary text,
  add column plaid_pfc_detailed text;
comment on column transactions.transfer_ignored is
  'Set by "Not a transfer". The matcher never pairs a row carrying this flag.';
comment on column transactions.plaid_pfc_primary is
  'Plaid personal_finance_category.primary (TRANSFER_OUT, LOAN_PAYMENTS, ...). Null on non-Plaid rows.';
comment on column transactions.plaid_pfc_detailed is
  'Plaid personal_finance_category.detailed (LOAN_PAYMENTS_CREDIT_CARD_PAYMENT, ...). Null on non-Plaid rows.';

-- ─── 2. transfers ─────────────────────────────────────────────────────────
create table transfers (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references households(id) on delete cascade,
  out_transaction_id uuid not null unique references transactions(id) on delete cascade,
  in_transaction_id  uuid not null unique references transactions(id) on delete cascade,
  created_at         timestamptz not null default now(),
  check (out_transaction_id <> in_transaction_id)
);
-- The unique constraints already index both leg columns (cascade + lookups).
create index transfers_household_idx on transfers(household_id);

-- ─── 3. Leg integrity ─────────────────────────────────────────────────────
-- Service-role inserts bypass the insert policy, so this is the only DB-side
-- guard on the legs. Definer (owned by postgres) so the check sees both legs
-- even when the caller can see only one of them. Trigger functions cannot be
-- called directly, so no revoke is needed.
--
-- The legs are read FOR SHARE: a "Not a transfer" flag or an amount edit
-- that commits while a detection is deciding cannot slip in between this
-- check and the insert (the update waits, then the flag check here or the
-- leg-change trigger below wins). A detection that read its pool before the
-- flag landed gets 23514 and skips, which the app treats as "someone
-- answered first".
create or replace function transfers_check_legs() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  o record;
  i record;
begin
  select household_id, account_id, amount_cents, transfer_ignored into o
    from transactions where id = new.out_transaction_id for share;
  if not found then raise exception 'transfer_leg_missing' using errcode = '23503'; end if;
  select household_id, account_id, amount_cents, transfer_ignored into i
    from transactions where id = new.in_transaction_id for share;
  if not found then raise exception 'transfer_leg_missing' using errcode = '23503'; end if;
  if o.household_id <> new.household_id or i.household_id <> new.household_id then
    raise exception 'transfer_household_mismatch' using errcode = '23514';
  end if;
  if o.account_id = i.account_id then
    raise exception 'transfer_same_account' using errcode = '23514';
  end if;
  if o.amount_cents <= 0 or i.amount_cents <> -o.amount_cents then
    raise exception 'transfer_amounts_not_opposite' using errcode = '23514';
  end if;
  if o.transfer_ignored or i.transfer_ignored then
    raise exception 'transfer_leg_ignored' using errcode = '23514';
  end if;
  return new;
end
$$;
create trigger transfers_check_legs before insert on transfers
  for each row execute function transfers_check_legs();

-- A leg whose money or account changed (Plaid `modified`, pending -> posted
-- with a new amount, a manual edit) no longer nets to zero with its partner:
-- drop the pair rather than hide a real expense behind a stale link. Date
-- drift is NOT an integrity fault (posting dates move); the app decides
-- whether a re-detect re-pairs.
create or replace function transfers_unlink_on_leg_change() returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  delete from transfers t
   where (t.out_transaction_id = new.id or t.in_transaction_id = new.id)
     and not exists (
       select 1
         from transactions o
         join transactions i on i.id = t.in_transaction_id
        where o.id = t.out_transaction_id
          and o.account_id <> i.account_id
          and o.amount_cents > 0
          and i.amount_cents = -o.amount_cents
     );
  return null;
end
$$;
create trigger transactions_transfer_leg_change
  after update of amount_cents, account_id on transactions
  for each row
  when (old.amount_cents is distinct from new.amount_cents
        or old.account_id is distinct from new.account_id)
  execute function transfers_unlink_on_leg_change();

-- ─── 4. RLS ───────────────────────────────────────────────────────────────
-- A pair is visible to whoever can see either leg, through the definer
-- helpers from 20260826000004 (a policy never re-enters transactions' own
-- policy). A login that can see neither leg sees nothing. Insert/delete need
-- edit rights on at least one leg: "Not a transfer" from the joint-account
-- side must work when the other leg is the partner's private account. No
-- update policy: a pair is immutable, unlink is a delete (default-deny).
alter table transfers enable row level security;
create policy transfers_select on transfers for select
  using (is_household_member(household_id)
         and (can_see_transaction(out_transaction_id) or can_see_transaction(in_transaction_id)));
create policy transfers_insert on transfers for insert to authenticated
  with check (is_household_member(household_id)
              and (can_edit_transaction(out_transaction_id) or can_edit_transaction(in_transaction_id)));
create policy transfers_delete on transfers for delete
  using (is_household_member(household_id)
         and (can_edit_transaction(out_transaction_id) or can_edit_transaction(in_transaction_id)));

-- ─── 5. households: one-time historical pass ──────────────────────────────
-- Null for every existing household so the next daily cron runs detection
-- over their whole history once. Writable by any member through
-- households_update, like settlement_close_day; the pass is idempotent.
alter table households add column transfers_backfilled_at timestamptz;
comment on column households.transfers_backfilled_at is
  'Set by the daily cron after the first transfer-detection pass over the whole ledger. Null = not yet run.';
