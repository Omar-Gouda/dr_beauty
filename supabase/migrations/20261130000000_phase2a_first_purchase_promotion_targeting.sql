begin;

-- Extend existing promotion rules. minimum_subtotal is the order subtotal for
-- order scope, and the eligible subtotal for targeted scopes.

-- This migration requires a short maintenance window. Pause checkout, order
-- status/payment/deletion/retention jobs, product/category/promotion writes, and
-- auth-user deletion; drain their in-flight transactions before starting.
-- Lock order follows catalog FKs and checkout: categories -> products -> auth
-- users -> promotions -> orders. In particular, never hold the orders lock
-- while waiting for promotions: checkout locks a promotion before inserting
-- an order. The pause is required because old in-flight lifecycle calls can
-- already hold inventory rows before they reach their order UPDATE.
lock table public.categories in share row exclusive mode;
lock table public.products in share row exclusive mode;
lock table auth.users in share row exclusive mode;
lock table public.promotions in access exclusive mode;
lock table public.orders in share row exclusive mode;

alter table public.promotions
  add column first_purchase_only boolean not null default false,
  add column application_scope text not null default 'order'
    check (application_scope in ('order', 'products', 'categories', 'product_and_category'));

create table public.promotion_product_targets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  unique (promotion_id, product_id)
);
create index promotion_product_targets_product_idx
  on public.promotion_product_targets (product_id, promotion_id);

create table public.promotion_category_targets (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.now(),
  unique (promotion_id, category_id)
);
create index promotion_category_targets_category_idx
  on public.promotion_category_targets (category_id, promotion_id);

alter table public.promotion_product_targets enable row level security;
alter table public.promotion_category_targets enable row level security;
revoke all privileges on table public.promotion_product_targets,
  public.promotion_category_targets from public, anon, authenticated, service_role;
grant select on table public.promotion_product_targets,
  public.promotion_category_targets to authenticated;

create policy promotion_product_targets_admin_read
  on public.promotion_product_targets for select to authenticated
  using ((select private.is_admin()));
create policy promotion_category_targets_admin_read
  on public.promotion_category_targets for select to authenticated
  using ((select private.is_admin()));

-- Durable, PII-light evidence that a customer has completed a qualifying first
-- purchase. The order reference detaches on retention deletion; the marker stays.
create table private.account_first_purchases (
  account_id uuid primary key references auth.users (id) on delete cascade,
  first_order_id uuid unique references public.orders (id) on delete set null,
  order_number_snapshot bigint not null,
  qualified_at timestamptz not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp()
);
-- Candidate rows cover every authenticated order that could still become a
-- delivered, paid purchase, regardless of whether it used a promotion.
create table private.first_purchase_order_candidates (
  account_id uuid not null references auth.users (id) on delete cascade,
  order_id uuid primary key references public.orders (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);
create index first_purchase_order_candidates_account_idx
  on private.first_purchase_order_candidates (account_id, created_at, order_id);

-- Exactly one account-level gate exists per account. Multiple candidate rows
-- during backfill are represented as ambiguous and fail closed until resolved.
-- reservation_order_id is a pointer into the candidate table; it intentionally
-- has no FK so candidate cascades can recompute the gate before commit.
create table private.account_first_purchase_reservations (
  account_id uuid primary key references auth.users (id) on delete cascade,
  reservation_order_id uuid unique,
  is_ambiguous boolean not null,
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (
    (is_ambiguous and reservation_order_id is null)
    or (not is_ambiguous and reservation_order_id is not null)
  )
);
alter table private.account_first_purchases enable row level security;
alter table private.first_purchase_order_candidates enable row level security;
alter table private.account_first_purchase_reservations enable row level security;
revoke all privileges on table private.account_first_purchases,
  private.first_purchase_order_candidates,
  private.account_first_purchase_reservations
  from public, anon, authenticated, service_role;

-- Backfill successful purchases before short-lived order rows can be removed.
insert into private.account_first_purchases (
  account_id, first_order_id, order_number_snapshot, qualified_at
)
select distinct on (order_row.user_id)
       order_row.user_id, order_row.id, order_row.order_number,
       coalesce(order_row.status_changed_at, order_row.updated_at, order_row.created_at)
from public.orders as order_row
where order_row.user_id is not null
  and order_row.order_status = 'delivered'
  and order_row.payment_status in ('paid', 'refunded')
order by order_row.user_id,
         coalesce(order_row.status_changed_at, order_row.updated_at, order_row.created_at),
         order_row.order_number;

-- Redemption history survives 45-day order retention. Use successful and
-- refunded redemption snapshots as additional evidence for retained orders.
insert into private.account_first_purchases (
  account_id, first_order_id, order_number_snapshot, qualified_at
)
select distinct on (redemption.account_id)
       redemption.account_id, redemption.order_id,
       redemption.order_number_snapshot,
       coalesce(redemption.qualified_at, redemption.recorded_at)
from private.promotion_redemptions as redemption
join auth.users as account on account.id = redemption.account_id
where redemption.status in ('redeemed', 'refunded')
order by redemption.account_id,
         coalesce(redemption.qualified_at, redemption.recorded_at),
         redemption.order_number_snapshot
on conflict (account_id) do nothing;

-- Backfill every order that can still become delivered and paid. Delivered
-- pending COD orders remain collectible; active paid/refunded orders can still
-- transition to delivery. Failed and cancelled orders cannot become paid by a
-- supported RPC. Multiple candidates for one account are intentionally retained.
insert into private.first_purchase_order_candidates (account_id, order_id)
select order_row.user_id, order_row.id
from public.orders as order_row
where order_row.user_id is not null
  and (
    (order_row.order_status in ('pending_confirmation', 'confirmed', 'processing', 'shipped')
      and order_row.payment_status in ('pending', 'paid', 'refunded'))
    or (order_row.order_status = 'delivered' and order_row.payment_status = 'pending')
  )
  and not exists (
    select 1 from private.account_first_purchases as purchase
    where purchase.account_id = order_row.user_id
  );

-- One gate row per account; a multi-order legacy conflict gets no arbitrary
-- owner and remains blocked until the candidate set resolves.
insert into private.account_first_purchase_reservations (
  account_id, reservation_order_id, is_ambiguous
)
select candidate.account_id,
       case when pg_catalog.count(*) = 1
         then (pg_catalog.array_agg(candidate.order_id))[1]
         else null
       end,
       pg_catalog.count(*) > 1
from private.first_purchase_order_candidates as candidate
group by candidate.account_id;

create function private.refresh_first_purchase_reservation(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_candidate_count bigint;
  v_reservation_order_id uuid;
begin
  if p_account_id is null then return; end if;

  -- Callers that create or change candidates hold the account lock before
  -- reaching this function. Candidate rows can also disappear through an
  -- order/auth FK cascade after the referenced row is locked; taking the
  -- advisory lock here would invert account -> order/auth lock ordering.
  if not exists (select 1 from auth.users as account where account.id = p_account_id)
     or exists (
       select 1 from private.account_first_purchases as purchase
       where purchase.account_id = p_account_id
     ) then
    delete from private.account_first_purchase_reservations as reservation
    where reservation.account_id = p_account_id;
    return;
  end if;

  select pg_catalog.count(*) into v_candidate_count
  from private.first_purchase_order_candidates as candidate
  where candidate.account_id = p_account_id;

  if v_candidate_count = 0 then
    delete from private.account_first_purchase_reservations as reservation
    where reservation.account_id = p_account_id;
    return;
  elsif v_candidate_count = 1 then
    select candidate.order_id into v_reservation_order_id
    from private.first_purchase_order_candidates as candidate
    where candidate.account_id = p_account_id
    order by candidate.created_at, candidate.order_id
    limit 1;
  else
    v_reservation_order_id := null;
  end if;

  insert into private.account_first_purchase_reservations (
    account_id, reservation_order_id, is_ambiguous, updated_at
  ) values (
    p_account_id, v_reservation_order_id, v_candidate_count > 1, pg_catalog.clock_timestamp()
  )
  on conflict (account_id) do update
  set reservation_order_id = excluded.reservation_order_id,
      is_ambiguous = excluded.is_ambiguous,
      updated_at = excluded.updated_at;
end;
$$;

create function private.refresh_first_purchase_reservation_after_candidate_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.refresh_first_purchase_reservation(old.account_id);
  else
    perform private.refresh_first_purchase_reservation(new.account_id);
  end if;
  return null;
end;
$$;

create trigger first_purchase_candidates_refresh_reservation
  after insert or delete on private.first_purchase_order_candidates
  for each row execute function private.refresh_first_purchase_reservation_after_candidate_change();

create function private.enforce_first_purchase_reservation_on_order_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is null then return new; end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text || ':promotion-first-purchase', 0)
  );

  if exists (
    select 1 from private.account_first_purchases as purchase
    where purchase.account_id = new.user_id
  ) then
    if new.promotion_id is not null and exists (
      select 1 from public.promotions as promotion
      where promotion.id = new.promotion_id and promotion.first_purchase_only
    ) then
      raise exception using errcode = 'P0001',
        message = 'This promotion is available for your first purchase only.';
    end if;
    return new;
  end if;

  if exists (
    select 1 from private.account_first_purchase_reservations as reservation
    where reservation.account_id = new.user_id
  ) or exists (
    select 1 from private.first_purchase_order_candidates as candidate
    where candidate.account_id = new.user_id
  ) then
    raise exception using errcode = 'P0001',
      message = 'Another order is reserving first-purchase eligibility; complete or cancel it before placing another order.';
  end if;
  return new;
end;
$$;

create function private.record_first_purchase_order_candidate_on_order_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and not exists (
    select 1 from private.account_first_purchases as purchase
    where purchase.account_id = new.user_id
  ) then
    if new.order_status = 'delivered' and new.payment_status in ('paid', 'refunded') then
      insert into private.account_first_purchases (
        account_id, first_order_id, order_number_snapshot, qualified_at
      ) values (
        new.user_id, new.id, new.order_number, pg_catalog.clock_timestamp()
      ) on conflict (account_id) do nothing;
    else
      insert into private.first_purchase_order_candidates (account_id, order_id)
      values (new.user_id, new.id)
      on conflict (order_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

-- State-changing RPC wrappers must hold this transaction advisory lock before
-- locking the order row. The AFTER trigger checks pg_locks rather than taking
-- the lock itself, so an unsupported direct UPDATE cannot invert lock order.
create function private.first_purchase_account_lock_is_held(p_account_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with expected as (
    select pg_catalog.hashtextextended(
      p_account_id::text || ':promotion-first-purchase', 0
    ) as lock_key
  )
  select exists (
    select 1
    from pg_catalog.pg_locks as lock_row
    cross join expected
    where lock_row.locktype = 'advisory'
      and lock_row.pid = pg_catalog.pg_backend_pid()
      and lock_row.granted
      and lock_row.mode = 'ExclusiveLock'
      and lock_row.classid = ((expected.lock_key >> 32) & 4294967295)::oid
      and lock_row.objid = (expected.lock_key & 4294967295)::oid
      and lock_row.objsubid = 1
  );
$$;

create function private.update_first_purchase_state_from_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_id is distinct from new.user_id then
    raise exception using errcode = '55000',
      message = 'An order cannot be reassigned to a different account during a state transition.';
  end if;
  if new.user_id is null then return new; end if;

  if not private.first_purchase_account_lock_is_held(new.user_id) then
    raise exception using errcode = '55000',
      message = 'Order state changes must use the account-locked lifecycle RPC.';
  end if;

  if new.order_status = 'delivered' and new.payment_status in ('paid', 'refunded') then
    insert into private.account_first_purchases (
      account_id, first_order_id, order_number_snapshot, qualified_at
    ) values (
      new.user_id, new.id, new.order_number, pg_catalog.clock_timestamp()
    ) on conflict (account_id) do nothing;
    delete from private.first_purchase_order_candidates as candidate
    where candidate.account_id = new.user_id;
  elsif new.order_status = 'cancelled' or new.payment_status = 'failed' then
    -- mark_cod_order_paid accepts only pending -> paid on delivered COD orders;
    -- failed cannot transition back to paid through a supported payment path.
    delete from private.first_purchase_order_candidates as candidate
    where candidate.order_id = new.id;
  end if;
  return new;
end;
$$;

alter function private.refresh_first_purchase_reservation(uuid) owner to postgres;
alter function private.refresh_first_purchase_reservation_after_candidate_change() owner to postgres;
alter function private.enforce_first_purchase_reservation_on_order_insert() owner to postgres;
alter function private.record_first_purchase_order_candidate_on_order_insert() owner to postgres;
alter function private.first_purchase_account_lock_is_held(uuid) owner to postgres;
alter function private.update_first_purchase_state_from_order() owner to postgres;
revoke all on function private.refresh_first_purchase_reservation(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.refresh_first_purchase_reservation_after_candidate_change()
  from public, anon, authenticated, service_role;
revoke all on function private.enforce_first_purchase_reservation_on_order_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.record_first_purchase_order_candidate_on_order_insert()
  from public, anon, authenticated, service_role;
revoke all on function private.first_purchase_account_lock_is_held(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.update_first_purchase_state_from_order()
  from public, anon, authenticated, service_role;
create trigger orders_enforce_first_purchase_reservation
  before insert on public.orders
  for each row execute function private.enforce_first_purchase_reservation_on_order_insert();
create trigger orders_record_first_purchase_candidate
  after insert on public.orders
  for each row execute function private.record_first_purchase_order_candidate_on_order_insert();
create trigger orders_update_first_purchase_state
  after update of order_status, payment_status on public.orders
  for each row execute function private.update_first_purchase_state_from_order();

-- Order deletion must take the account lock before locking the order row. The
-- candidate FK cascade refreshes the gate without taking another advisory lock.
create or replace function public.delete_admin_order(p_order_id uuid)
returns table (deleted boolean, order_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_number bigint;
  v_account_id uuid;
  v_locked_account_id uuid;
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'The order identifier is invalid.';
  end if;

  -- This first read deliberately does not lock the order row.
  select order_row.user_id into v_account_id
  from public.orders as order_row
  where order_row.id = p_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The order was not found.';
  end if;
  if v_account_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_account_id::text || ':promotion-first-purchase', 0)
    );
  end if;

  select order_row.order_number, order_row.user_id
    into v_order_number, v_locked_account_id
  from public.orders as order_row
  where order_row.id = p_order_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The order was not found.';
  end if;
  if v_locked_account_id is distinct from v_account_id then
    raise exception using errcode = '40001', message = 'The order account changed; retry the deletion.';
  end if;

  perform private.hard_delete_order_rows(p_order_id);
  deleted := true;
  order_number := v_order_number;
  return next;
end;
$$;
revoke all on function public.delete_admin_order(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.delete_admin_order(uuid) to authenticated;

-- Retention previously selected rows FOR UPDATE before taking any account
-- lock. Read candidate identifiers first, then lock account -> order, matching
-- checkout, cancellation, COD payment collection, and manual hard deletion.
create or replace function private.run_order_retention_cleanup(p_batch_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started_at timestamptz := pg_catalog.clock_timestamp();
  v_run_id uuid := pg_catalog.gen_random_uuid();
  v_batch_limit integer := coalesce(p_batch_limit, 100);
  v_deleted_count integer := 0;
  v_sqlstate text;
  v_candidate record;
  v_locked_order_id uuid;
begin
  if v_batch_limit < 1 or v_batch_limit > 500 then
    raise exception using errcode = '22023', message = 'The retention batch limit is invalid.';
  end if;

  begin
    -- Account ordering is global so overlapping cleanup batches cannot hold
    -- locks for accounts in opposite orders and form a deadlock cycle.
    for v_candidate in
      select order_row.id, order_row.user_id
      from public.orders as order_row
      where order_row.order_status in ('delivered', 'cancelled')
        and order_row.retention_started_at <= v_started_at - interval '45 days'
      order by order_row.user_id nulls first,
               order_row.retention_started_at, order_row.id
      limit v_batch_limit
    loop
      if v_candidate.user_id is not null then
        perform pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(v_candidate.user_id::text || ':promotion-first-purchase', 0)
        );
      end if;

      v_locked_order_id := null;
      select order_row.id into v_locked_order_id
      from public.orders as order_row
      where order_row.id = v_candidate.id
        and order_row.order_status in ('delivered', 'cancelled')
        and order_row.retention_started_at <= v_started_at - interval '45 days'
      for update of order_row skip locked;
      if v_locked_order_id is null then
        continue;
      end if;

      perform private.hard_delete_order_rows(v_locked_order_id);
      v_deleted_count := v_deleted_count + 1;
    end loop;
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    v_deleted_count := 0;
    insert into private.order_retention_cleanup_runs (
      id, started_at, completed_at, batch_limit, deleted_count, outcome, sqlstate
    ) values (
      v_run_id, v_started_at, pg_catalog.clock_timestamp(), v_batch_limit, 0, 'failed', v_sqlstate
    );
    return pg_catalog.jsonb_build_object(
      'run_id', v_run_id, 'outcome', 'failed', 'deleted_count', 0, 'sqlstate', v_sqlstate
    );
  end;

  insert into private.order_retention_cleanup_runs (
    id, started_at, completed_at, batch_limit, deleted_count, outcome, sqlstate
  ) values (
    v_run_id, v_started_at, pg_catalog.clock_timestamp(), v_batch_limit, v_deleted_count, 'succeeded', null
  );

  return pg_catalog.jsonb_build_object(
    'run_id', v_run_id, 'outcome', 'succeeded', 'deleted_count', v_deleted_count
  );
end;
$$;

-- Put lifecycle and payment entry points behind account-first locking wrappers.
-- The original SECURITY DEFINER implementations retain their owners and behavior;
-- each public wrapper is assigned that implementation's owner after validation.
alter function public.transition_cod_order_status(uuid, text, text, text, text)
  set schema private;
alter function private.transition_cod_order_status(uuid, text, text, text, text)
  rename to transition_cod_order_status_unlocked;
revoke all on function private.transition_cod_order_status_unlocked(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;

create function public.transition_cod_order_status(
  p_order_id uuid,
  p_new_status text,
  p_shipping_carrier text default null,
  p_tracking_number text default null,
  p_tracking_url text default null
)
returns table (
  order_number bigint,
  order_status text,
  status_changed_at timestamptz,
  shipped_at timestamptz,
  cancelled_at timestamptz,
  shipping_carrier text,
  tracking_number text,
  tracking_url text,
  inventory_restored_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  select order_row.user_id into v_account_id
  from public.orders as order_row
  where order_row.id = p_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The order was not found.';
  end if;

  -- Match checkout's account lock before the internal routine locks the order
  -- or any inventory rows. The AFTER UPDATE state trigger reacquires this
  -- transaction lock reentrantly.
  if v_account_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_account_id::text || ':promotion-first-purchase', 0)
    );
  end if;

  return query
  select result.order_number, result.order_status, result.status_changed_at,
         result.shipped_at, result.cancelled_at, result.shipping_carrier,
         result.tracking_number, result.tracking_url, result.inventory_restored_at
  from private.transition_cod_order_status_unlocked(
    p_order_id, p_new_status, p_shipping_carrier, p_tracking_number, p_tracking_url
  ) as result;
end;
$$;
-- Keep the original SECURITY DEFINER owner. Fail closed if that owner cannot
-- call the moved implementation through the private schema.
do $$
declare
  v_owner name;
begin
  select pg_catalog.pg_get_userbyid(function_row.proowner)
    into strict v_owner
  from pg_catalog.pg_proc as function_row
  where function_row.oid =
    'private.transition_cod_order_status_unlocked(uuid,text,text,text,text)'::pg_catalog.regprocedure;
  if not pg_catalog.has_schema_privilege(v_owner, 'private', 'USAGE')
     or not pg_catalog.has_schema_privilege(v_owner, 'public', 'CREATE') then
    raise exception 'Original transition_cod_order_status owner lacks required private USAGE or public CREATE privilege';
  end if;
  execute pg_catalog.format(
    'alter function public.transition_cod_order_status(uuid, text, text, text, text) owner to %I',
    v_owner
  );
end;
$$;
revoke all on function public.transition_cod_order_status(uuid, text, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.transition_cod_order_status(uuid, text, text, text, text)
  to authenticated;

alter function public.mark_cod_order_paid(uuid) set schema private;
alter function private.mark_cod_order_paid(uuid) rename to mark_cod_order_paid_unlocked;
revoke all on function private.mark_cod_order_paid_unlocked(uuid)
  from public, anon, authenticated, service_role;

create function public.mark_cod_order_paid(p_order_id uuid)
returns table (
  order_number bigint,
  order_status text,
  payment_status text,
  newly_paid boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  select order_row.user_id into v_account_id
  from public.orders as order_row
  where order_row.id = p_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The order was not found.';
  end if;

  -- Payment collection and checkout use the same account-before-order order.
  if v_account_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_account_id::text || ':promotion-first-purchase', 0)
    );
  end if;

  return query
  select result.order_number, result.order_status, result.payment_status, result.newly_paid
  from private.mark_cod_order_paid_unlocked(p_order_id) as result;
end;
$$;
do $$
declare
  v_owner name;
begin
  select pg_catalog.pg_get_userbyid(function_row.proowner)
    into strict v_owner
  from pg_catalog.pg_proc as function_row
  where function_row.oid =
    'private.mark_cod_order_paid_unlocked(uuid)'::pg_catalog.regprocedure;
  if not pg_catalog.has_schema_privilege(v_owner, 'private', 'USAGE')
     or not pg_catalog.has_schema_privilege(v_owner, 'public', 'CREATE') then
    raise exception 'Original mark_cod_order_paid owner lacks required private USAGE or public CREATE privilege';
  end if;
  execute pg_catalog.format(
    'alter function public.mark_cod_order_paid(uuid) owner to %I',
    v_owner
  );
end;
$$;
revoke all on function public.mark_cod_order_paid(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.mark_cod_order_paid(uuid) to authenticated;

-- Preview only: expose eligibility booleans and public target identifiers, never
-- redemption rows or counts. Final checkout repeats these checks under locks.
create function public.get_promotion_preview_eligibility(p_promotion_id uuid)
returns table (
  global_capacity_available boolean,
  account_capacity_available boolean,
  first_purchase_eligible boolean,
  first_purchase_only boolean,
  application_scope text,
  product_target_ids uuid[],
  category_target_ids uuid[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := auth.uid();
  v_promotion public.promotions%rowtype;
  v_global_usage bigint;
  v_account_usage bigint;
  v_first_purchase_eligible boolean;
  v_product_target_ids uuid[];
  v_category_target_ids uuid[];
begin
  if v_account_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required to check promotion eligibility.';
  end if;
  if p_promotion_id is null then
    raise exception using errcode = '22023', message = 'A promotion identifier is required.';
  end if;

  select promotion.* into v_promotion
  from public.promotions as promotion
  where promotion.id = p_promotion_id
  for share;
  if not found or not v_promotion.is_active
     or (v_promotion.starts_at is not null and v_promotion.starts_at > pg_catalog.statement_timestamp())
     or (v_promotion.ends_at is not null and v_promotion.ends_at <= pg_catalog.statement_timestamp()) then
    return query select false, false, false, false, 'order'::text, '{}'::uuid[], '{}'::uuid[];
    return;
  end if;

  select
    pg_catalog.count(*) filter (where redemption.status in ('reserved', 'redeemed', 'refunded')),
    pg_catalog.count(*) filter (
      where redemption.account_id = v_account_id
        and redemption.status in ('reserved', 'redeemed', 'refunded')
    )
  into v_global_usage, v_account_usage
  from private.promotion_redemptions as redemption
  where redemption.promotion_id = p_promotion_id;

  v_first_purchase_eligible := not v_promotion.first_purchase_only or (
    not exists (
      select 1 from private.account_first_purchases as purchase
      where purchase.account_id = v_account_id
    ) and not exists (
      select 1 from private.account_first_purchase_reservations as reservation
      where reservation.account_id = v_account_id
    ) and not exists (
      select 1 from private.first_purchase_order_candidates as candidate
      where candidate.account_id = v_account_id
    )
  );

  select coalesce(pg_catalog.array_agg(target.product_id order by target.product_id), '{}'::uuid[])
    into v_product_target_ids
  from public.promotion_product_targets as target
  where target.promotion_id = p_promotion_id;
  select coalesce(pg_catalog.array_agg(target.category_id order by target.category_id), '{}'::uuid[])
    into v_category_target_ids
  from public.promotion_category_targets as target
  where target.promotion_id = p_promotion_id;

  return query select
    v_promotion.maximum_redemptions is null or v_global_usage < v_promotion.maximum_redemptions,
    v_promotion.per_account_redemption_limit is null or v_account_usage < v_promotion.per_account_redemption_limit,
    v_first_purchase_eligible,
    v_promotion.first_purchase_only,
    v_promotion.application_scope,
    v_product_target_ids,
    v_category_target_ids;
end;
$$;
alter function public.get_promotion_preview_eligibility(uuid) owner to postgres;
revoke all on function public.get_promotion_preview_eligibility(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_promotion_preview_eligibility(uuid) to authenticated;

-- Saving promotion fields and target relationships in one transaction prevents
-- partial edits and rejects target/scope mismatches even on direct RPC calls.
create function public.save_admin_promotion(
  p_promotion jsonb,
  p_product_ids uuid[] default '{}'::uuid[],
  p_category_ids uuid[] default '{}'::uuid[]
)
returns setof public.promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_values record;
  v_saved public.promotions%rowtype;
  v_previous public.promotions%rowtype;
  v_product_ids uuid[] := coalesce(p_product_ids, '{}'::uuid[]);
  v_category_ids uuid[] := coalesce(p_category_ids, '{}'::uuid[]);
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_promotion is null or pg_catalog.jsonb_typeof(p_promotion) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'Promotion details are invalid.';
  end if;

  select fields.* into v_values
  from pg_catalog.jsonb_to_record(p_promotion) as fields(
    id uuid, code text, title text, description text, discount_type text,
    discount_value numeric, maximum_discount numeric, minimum_subtotal numeric,
    starts_at timestamptz, ends_at timestamptz, maximum_redemptions integer,
    per_account_redemption_limit integer, is_active boolean, is_featured boolean,
    display_priority integer, target_path text, is_announcement boolean,
    announcement_priority integer, first_purchase_only boolean, application_scope text
  );

  if v_values.code is null or v_values.discount_type is null or v_values.discount_value is null
     or v_values.minimum_subtotal is null or v_values.is_active is null
     or v_values.is_featured is null or v_values.display_priority is null
     or v_values.target_path is null or v_values.is_announcement is null
     or v_values.announcement_priority is null or v_values.first_purchase_only is null
     or v_values.application_scope is null
     or v_values.application_scope not in ('order', 'products', 'categories', 'product_and_category') then
    raise exception using errcode = '22023', message = 'Promotion details are incomplete or invalid.';
  end if;

  if exists (select 1 from pg_catalog.unnest(v_product_ids) as selected(id) where selected.id is null)
     or exists (select 1 from pg_catalog.unnest(v_category_ids) as selected(id) where selected.id is null)
     or exists (select selected.id from pg_catalog.unnest(v_product_ids) as selected(id) group by selected.id having pg_catalog.count(*) > 1)
     or exists (select selected.id from pg_catalog.unnest(v_category_ids) as selected(id) group by selected.id having pg_catalog.count(*) > 1) then
    raise exception using errcode = '22023', message = 'Promotion targets contain invalid or duplicate selections.';
  end if;

  if (v_values.application_scope = 'order' and
      (pg_catalog.cardinality(v_product_ids) <> 0 or pg_catalog.cardinality(v_category_ids) <> 0))
     or (v_values.application_scope = 'products' and
      (pg_catalog.cardinality(v_product_ids) = 0 or pg_catalog.cardinality(v_category_ids) <> 0))
     or (v_values.application_scope = 'categories' and
      (pg_catalog.cardinality(v_category_ids) = 0 or pg_catalog.cardinality(v_product_ids) <> 0))
     or (v_values.application_scope = 'product_and_category' and
      (pg_catalog.cardinality(v_product_ids) = 0 or pg_catalog.cardinality(v_category_ids) = 0)) then
    raise exception using errcode = '22023', message = 'Choose valid targets for the selected application scope.';
  end if;

  if v_values.id is null then
    insert into public.promotions (
      code, title, description, discount_type, discount_value, maximum_discount,
      minimum_subtotal, starts_at, ends_at, maximum_redemptions,
      per_account_redemption_limit, is_active, is_featured, display_priority,
      target_path, is_announcement, announcement_priority, first_purchase_only,
      application_scope
    ) values (
      v_values.code, v_values.title, v_values.description, v_values.discount_type,
      v_values.discount_value, v_values.maximum_discount, v_values.minimum_subtotal,
      v_values.starts_at, v_values.ends_at, v_values.maximum_redemptions,
      v_values.per_account_redemption_limit, v_values.is_active, v_values.is_featured,
      v_values.display_priority, v_values.target_path, v_values.is_announcement,
      v_values.announcement_priority, v_values.first_purchase_only, v_values.application_scope
    ) returning * into v_saved;
  else
    select promotion.* into v_previous
    from public.promotions as promotion
    where promotion.id = v_values.id
    for update;
    if not found then
      raise exception using errcode = 'P0002', message = 'The promotion was not found.';
    end if;
    if v_values.first_purchase_only and not v_previous.first_purchase_only and exists (
      select 1 from public.orders as existing_order
      where existing_order.promotion_id = v_values.id
        and existing_order.order_status in ('pending_confirmation', 'confirmed', 'processing', 'shipped')
    ) then
      raise exception using errcode = '23514',
        message = 'First-purchase eligibility cannot be enabled while this promotion has active orders.';
    end if;
    update public.promotions as promotion
    set code = v_values.code,
        title = v_values.title,
        description = v_values.description,
        discount_type = v_values.discount_type,
        discount_value = v_values.discount_value,
        maximum_discount = v_values.maximum_discount,
        minimum_subtotal = v_values.minimum_subtotal,
        starts_at = v_values.starts_at,
        ends_at = v_values.ends_at,
        maximum_redemptions = v_values.maximum_redemptions,
        per_account_redemption_limit = v_values.per_account_redemption_limit,
        is_active = v_values.is_active,
        is_featured = v_values.is_featured,
        display_priority = v_values.display_priority,
        target_path = v_values.target_path,
        is_announcement = v_values.is_announcement,
        announcement_priority = v_values.announcement_priority,
        first_purchase_only = v_values.first_purchase_only,
        application_scope = v_values.application_scope
    where promotion.id = v_values.id
    returning promotion.* into v_saved;
  end if;

  delete from public.promotion_product_targets as target where target.promotion_id = v_saved.id;
  delete from public.promotion_category_targets as target where target.promotion_id = v_saved.id;
  insert into public.promotion_product_targets (promotion_id, product_id)
  select v_saved.id, selected.id from pg_catalog.unnest(v_product_ids) as selected(id);
  insert into public.promotion_category_targets (promotion_id, category_id)
  select v_saved.id, selected.id from pg_catalog.unnest(v_category_ids) as selected(id);

  return next v_saved;
end;
$$;
alter function public.save_admin_promotion(jsonb, uuid[], uuid[]) owner to postgres;
revoke all on function public.save_admin_promotion(jsonb, uuid[], uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.save_admin_promotion(jsonb, uuid[], uuid[]) to authenticated;

-- The authoritative create-order implementation follows, based on the current
-- checkout RPC with trusted targeting math and first-purchase locking added.
create or replace function public.create_cod_order(
  p_items jsonb,
  p_idempotency_key uuid,
  p_customer_name text,
  p_customer_phone text,
  p_governorate text,
  p_city text,
  p_address_line text,
  p_delivery_notes text default null,
  p_promotion_code text default null
)
returns table (
  order_number bigint,
  order_status text,
  total_amount numeric,
  currency text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_customer_email text;
  v_now timestamptz;
  v_requested_count integer;
  v_distinct_count integer;
  v_invalid_count integer;
  v_locked_count integer := 0;
  v_subtotal numeric(14, 2) := 0;
  v_shipping numeric(12, 2) := 0;
  v_shipping_fee numeric(12, 2) := 0;
  v_shipping_discount numeric(12, 2) := 0;
  v_shipping_settings public.shipping_settings%rowtype;
  v_discount numeric(14, 2) := 0;
  v_total numeric(14, 2);
  v_order_id uuid;
  v_order_number bigint;
  v_existing_status text;
  v_existing_total numeric(14, 2);
  v_existing_currency text;
  v_request_payload jsonb;
  v_existing_payload jsonb;
  v_promotion public.promotions%rowtype;
  v_promotion_id uuid;
  v_promotion_code text;
  v_redemptions bigint;
  v_eligible_subtotal numeric(14, 2) := 0;
  v_line record;
  v_stock_row_count integer;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if p_idempotency_key is null then
    raise exception using errcode = '22023', message = 'An idempotency key is required.';
  end if;

  select auth_user.email into v_customer_email
  from auth.users as auth_user
  where auth_user.id = v_user_id;

  if p_items is null or pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'The order items must be a JSON array.';
  end if;
  if pg_catalog.jsonb_array_length(p_items) < 1
     or pg_catalog.jsonb_array_length(p_items) > 50 then
    raise exception using errcode = '22023', message = 'The order must contain between 1 and 50 distinct products.';
  end if;

  if p_customer_name is null or pg_catalog.length(pg_catalog.btrim(p_customer_name)) not between 1 and 160
     or p_customer_phone is null or pg_catalog.length(pg_catalog.btrim(p_customer_phone)) not between 1 and 40
     or p_governorate is null or pg_catalog.length(pg_catalog.btrim(p_governorate)) not between 1 and 120
     or p_city is null or pg_catalog.length(pg_catalog.btrim(p_city)) not between 1 and 120
     or p_address_line is null or pg_catalog.length(pg_catalog.btrim(p_address_line)) not between 1 and 1000
     or (p_delivery_notes is not null and pg_catalog.length(pg_catalog.btrim(p_delivery_notes)) > 1000)
     or (p_promotion_code is not null and pg_catalog.length(pg_catalog.btrim(p_promotion_code)) > 64) then
    raise exception using errcode = '22023', message = 'Customer or delivery information is invalid.';
  end if;

  select pg_catalog.count(*), pg_catalog.count(distinct requested.product_id),
         pg_catalog.count(*) filter (
           where requested.product_id is null
              or requested.quantity is null
              or requested.quantity < 1
              or requested.quantity > 999
         )
    into v_requested_count, v_distinct_count, v_invalid_count
  from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer);

  if v_invalid_count > 0 or v_requested_count <> v_distinct_count then
    raise exception using errcode = '22023', message = 'Product identifiers and quantities are invalid or duplicated.';
  end if;

  v_request_payload := private.cod_order_request_payload(
    p_items,
    p_customer_name,
    v_customer_email,
    p_customer_phone,
    p_governorate,
    p_city,
    p_address_line,
    p_delivery_notes,
    p_promotion_code
  );

  -- Serialize retries with the same authenticated customer/key pair.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':' || p_idempotency_key::text, 0)
  );

  select binding.order_id, binding.request_payload
    into v_order_id, v_existing_payload
  from private.cod_order_idempotency as binding
  where binding.user_id = v_user_id and binding.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using errcode = '22023', message = 'This idempotency key was already used for a different checkout request.';
    end if;

    select o.order_number, o.order_status, o.total_amount, o.currency
      into v_order_number, v_existing_status, v_existing_total, v_existing_currency
    from public.orders as o
    where o.id = v_order_id and o.user_id = v_user_id and o.idempotency_key = p_idempotency_key;
    if not found then
      raise exception using errcode = 'P0001', message = 'The saved checkout confirmation is unavailable.';
    end if;

    order_number := v_order_number;
    order_status := v_existing_status;
    total_amount := v_existing_total;
    currency := v_existing_currency;
    return next;
    return;
  end if;

  -- Recover an order inserted by the previous function during a migration
  -- deployment window, or any legacy keyed row not included in the backfill.
  select
    o.id,
    o.order_number,
    o.order_status,
    o.total_amount,
    o.currency,
    private.cod_order_request_payload(
      coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object('product_id', oi.product_id::text, 'quantity', oi.quantity)
            order by oi.product_id
          )
          from public.order_items as oi
          where oi.order_id = o.id
        ),
        '[]'::jsonb
      ),
      o.customer_name,
      o.customer_email,
      o.customer_phone,
      o.governorate,
      o.city,
      o.address_line,
      o.delivery_notes,
      o.promotion_code_snapshot
    )
    into v_order_id, v_order_number, v_existing_status, v_existing_total, v_existing_currency, v_existing_payload
  from public.orders as o
  where o.user_id = v_user_id and o.idempotency_key = p_idempotency_key;

  if found then
    if v_existing_payload is distinct from v_request_payload then
      raise exception using errcode = '22023', message = 'This idempotency key was already used for a different checkout request.';
    end if;

    insert into private.cod_order_idempotency (user_id, idempotency_key, order_id, request_payload)
    values (v_user_id, p_idempotency_key, v_order_id, v_existing_payload)
    on conflict (user_id, idempotency_key) do nothing;

    order_number := v_order_number;
    order_status := v_existing_status;
    total_amount := v_existing_total;
    currency := v_existing_currency;
    return next;
    return;
  end if;

  -- Serialize first-purchase checks and pending first-purchase claims for this account.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text || ':promotion-first-purchase', 0)
  );

  -- Every authenticated order, not just promotion-bearing orders, reserves
  -- first-purchase eligibility until it is cancelled, definitively failed, or
  -- establishes the permanent paid-delivery marker. This prevents ordinary
  -- COD orders from racing a first-purchase promotion order.
  if not exists (
       select 1 from private.account_first_purchases as purchase
       where purchase.account_id = v_user_id
     ) and (
       exists (
         select 1 from private.account_first_purchase_reservations as reservation
         where reservation.account_id = v_user_id
       ) or exists (
         select 1 from private.first_purchase_order_candidates as candidate
         where candidate.account_id = v_user_id
       )
     ) then
    raise exception using errcode = 'P0001',
      message = 'An earlier order is reserving first-purchase eligibility; complete or cancel it before placing another order.';
  end if;

  select pg_catalog.count(*)
    into v_locked_count
  from (
    select p.id
    from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
    join public.products as p on p.id = requested.product_id and p.is_active
    join public.product_inventory as inventory on inventory.product_id = p.id
  ) as available_products;

  if v_locked_count <> v_requested_count then
    raise exception using errcode = 'P0001', message = 'One or more products are unavailable.';
  end if;

  v_locked_count := 0;
  for v_line in
    select p.id as product_id, p.name as product_name, p.slug as product_slug,
           p.price as unit_price, requested.quantity,
           inventory.stock_quantity
    from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
    join public.products as p on p.id = requested.product_id and p.is_active
    join public.product_inventory as inventory on inventory.product_id = p.id
    order by p.id
    for update of p, inventory
  loop
    v_locked_count := v_locked_count + 1;
    if v_line.stock_quantity < v_line.quantity then
      raise exception using errcode = 'P0001', message = 'One or more products do not have sufficient stock.';
    end if;

    if v_line.unit_price * v_line.quantity > 999999999999.99 then
      raise exception using errcode = '22003', message = 'The order amount exceeds the supported limit.';
    end if;
    v_subtotal := v_subtotal + v_line.unit_price * v_line.quantity;
    if v_subtotal > 999999999999.99 then
      raise exception using errcode = '22003', message = 'The order amount exceeds the supported limit.';
    end if;
  end loop;

  if v_locked_count <> v_requested_count then
    raise exception using errcode = 'P0001', message = 'One or more products are unavailable.';
  end if;

  select settings.* into v_shipping_settings
  from public.shipping_settings as settings
  where settings.id is true;

  if not found or not v_shipping_settings.is_shipping_enabled then
    raise exception using errcode = 'P0001', message = 'Shipping is not currently available.';
  end if;

  v_shipping_fee := v_shipping_settings.default_fee;
  v_shipping_discount := case
    when v_shipping_settings.free_shipping_minimum_subtotal is not null
      and v_subtotal > v_shipping_settings.free_shipping_minimum_subtotal
    then v_shipping_fee
    else 0
  end;
  v_shipping := v_shipping_fee - v_shipping_discount;
  v_now := pg_catalog.clock_timestamp();
  if p_promotion_code is not null and pg_catalog.btrim(p_promotion_code) <> '' then
    select promotion.* into v_promotion
    from public.promotions as promotion
    where pg_catalog.lower(promotion.code) = pg_catalog.lower(pg_catalog.btrim(p_promotion_code))
    for share;

    if not found or not v_promotion.is_active
       or (v_promotion.starts_at is not null and v_promotion.starts_at > v_now)
       or (v_promotion.ends_at is not null and v_promotion.ends_at <= v_now) then
      raise exception using errcode = 'P0001', message = 'The promotion is invalid or not eligible for this order.';
    end if;

    if v_promotion.application_scope = 'order' then
      v_eligible_subtotal := v_subtotal;
    else
      select coalesce(pg_catalog.sum(product.price * requested.quantity), 0)
        into v_eligible_subtotal
      from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
      join public.products as product
        on product.id = requested.product_id and product.is_active
      where (v_promotion.application_scope = 'products' and exists (
               select 1 from public.promotion_product_targets as target
               where target.promotion_id = v_promotion.id and target.product_id = product.id
             ))
         or (v_promotion.application_scope = 'categories' and exists (
               select 1 from public.promotion_category_targets as target
               where target.promotion_id = v_promotion.id and target.category_id = product.category_id
             ))
         or (v_promotion.application_scope = 'product_and_category' and (
               exists (select 1 from public.promotion_product_targets as target
                       where target.promotion_id = v_promotion.id and target.product_id = product.id)
               or exists (select 1 from public.promotion_category_targets as target
                          where target.promotion_id = v_promotion.id and target.category_id = product.category_id)
             ));
    end if;

    if v_eligible_subtotal < v_promotion.minimum_subtotal
       or (v_promotion.application_scope <> 'order' and v_eligible_subtotal <= 0) then
      raise exception using errcode = 'P0001', message = 'The promotion is invalid or not eligible for this order.';
    end if;

    if v_promotion.first_purchase_only and exists (
      select 1 from private.account_first_purchases as purchase
      where purchase.account_id = v_user_id
    ) then
      raise exception using errcode = 'P0001', message = 'This promotion is available for your first purchase only.';
    end if;

    if v_promotion.maximum_redemptions is not null then
      select pg_catalog.count(*) into v_redemptions
      from public.orders as existing_order
      where existing_order.promotion_id = v_promotion.id
        and existing_order.order_status <> 'cancelled';
      if v_redemptions >= v_promotion.maximum_redemptions then
        raise exception using errcode = 'P0001', message = 'The promotion redemption limit has been reached.';
      end if;
    end if;

    if v_promotion.discount_type = 'percentage' then
      v_discount := pg_catalog.round(v_eligible_subtotal * v_promotion.discount_value / 100, 2);
      if v_promotion.maximum_discount is not null then
        v_discount := least(v_discount, v_promotion.maximum_discount);
      end if;
    else
      v_discount := least(v_eligible_subtotal, v_promotion.discount_value);
    end if;
    v_discount := least(v_discount, v_eligible_subtotal);
    v_promotion_id := v_promotion.id;
    v_promotion_code := v_promotion.code;
  end if;

  v_total := v_subtotal + v_shipping - v_discount;
  if v_total > 999999999999.99 then
    raise exception using errcode = '22003', message = 'The order amount exceeds the supported limit.';
  end if;
  insert into public.orders as created_order (
    user_id, idempotency_key, promotion_id, promotion_code_snapshot,
    customer_name, customer_email, customer_phone, governorate, city,
    address_line, delivery_notes, payment_method, payment_status, order_status,
    subtotal, shipping_amount, shipping_discount_amount, discount_amount, currency
  ) values (
    v_user_id, p_idempotency_key, v_promotion_id, v_promotion_code,
    pg_catalog.btrim(p_customer_name), v_customer_email, pg_catalog.btrim(p_customer_phone),
    pg_catalog.btrim(p_governorate), pg_catalog.btrim(p_city),
    pg_catalog.btrim(p_address_line), nullif(pg_catalog.btrim(p_delivery_notes), ''),
    'cod', 'pending', 'pending_confirmation', v_subtotal, v_shipping, v_shipping_discount, v_discount, 'EGP'
  ) returning created_order.id, created_order.order_number into v_order_id, v_order_number;

  insert into public.order_items (
    order_id, product_id, product_name_snapshot, product_slug_snapshot, unit_price, quantity
  )
  select v_order_id, p.id, p.name, p.slug, p.price, requested.quantity
  from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
  join public.products as p on p.id = requested.product_id
  order by p.id;

  for v_line in
    select requested.product_id, requested.quantity
    from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
    order by requested.product_id
  loop
    update public.product_inventory as inventory
    set stock_quantity = inventory.stock_quantity - v_line.quantity
    where inventory.product_id = v_line.product_id
      and inventory.stock_quantity >= v_line.quantity;
    get diagnostics v_stock_row_count = row_count;
    if v_stock_row_count <> 1 then
      raise exception using errcode = 'P0001', message = 'Stock changed while creating this order; please retry.';
    end if;
  end loop;

  insert into private.cod_order_idempotency (user_id, idempotency_key, order_id, request_payload)
  values (v_user_id, p_idempotency_key, v_order_id, v_request_payload);

  order_number := v_order_number;
  order_status := 'pending_confirmation';
  total_amount := v_total;
  currency := 'EGP';
  return next;
end;
$$;

commit;
