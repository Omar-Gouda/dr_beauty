begin;

-- Keep historical account redemption identities. Orders can lose user_id when an
-- Auth account is deleted, so do not invent an identity for legacy rows.
do $$
begin
  if exists (
    select 1 from public.orders as order_row
    where order_row.promotion_id is not null and order_row.user_id is null
  ) then
    raise exception 'Cannot create account redemption history: a promotion-bearing order has no account id.';
  end if;
end;
$$;

alter table public.promotions
  add column per_account_redemption_limit integer default 1,
  add constraint promotions_per_account_redemption_limit_check
    check (per_account_redemption_limit is null or per_account_redemption_limit > 0);
comment on column public.promotions.per_account_redemption_limit is
  'Maximum counted redemptions per authenticated account; NULL means unlimited. Global maximum_redemptions is independent.';

-- Legacy terminal rows get at least 45 days from deployment before cleanup.
-- Earlier lifecycle timestamps are not reliable for every pre-existing row.
alter table public.orders add column retention_started_at timestamptz;

create index orders_terminal_retention_idx
  on public.orders (retention_started_at, id)
  where order_status in ('delivered', 'cancelled') and retention_started_at is not null;

-- Complete order snapshot/deletion FK changes before updating orders; PostgreSQL
-- rejects these constraint changes while the orders backfill has pending events.
alter table public.order_items
  alter column product_id drop not null,
  drop constraint order_items_product_id_fkey,
  add constraint order_items_product_id_fkey
    foreign key (product_id) references public.products (id) on delete set null,
  drop constraint order_items_order_id_fkey,
  add constraint order_items_order_id_fkey
    foreign key (order_id) references public.orders (id) on delete cascade;

update public.orders as order_row
set retention_started_at = greatest(
  coalesce(order_row.cancelled_at, order_row.status_changed_at),
  pg_catalog.transaction_timestamp()
)
where order_row.order_status in ('delivered', 'cancelled');

create function private.set_order_retention_started_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.order_status in ('delivered', 'cancelled') then
      new.retention_started_at := pg_catalog.clock_timestamp();
    else
      new.retention_started_at := null;
    end if;
    return new;
  end if;

  if new.order_status in ('delivered', 'cancelled') then
    if old.order_status in ('delivered', 'cancelled') and old.retention_started_at is not null then
      new.retention_started_at := old.retention_started_at;
    else
      new.retention_started_at := pg_catalog.clock_timestamp();
    end if;
  else
    -- Reopening a terminal order starts a fresh retention period if it later
    -- enters a terminal state again. The lifecycle RPC currently disallows it.
    new.retention_started_at := null;
  end if;
  return new;
end;
$$;

create trigger orders_set_retention_started_at
  before insert or update on public.orders
  for each row execute function private.set_order_retention_started_at();
revoke all on function private.set_order_retention_started_at()
  from public, anon, authenticated, service_role;

-- One PII-free row per promotion-bearing order. Reservations count against
-- capacity until cancellation; delivered-and-paid COD is a successful use.
create table private.promotion_redemptions (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  promotion_id uuid not null references public.promotions (id) on delete restrict,
  order_id uuid unique references public.orders (id) on delete set null,
  account_id uuid not null,
  order_number_snapshot bigint not null,
  promotion_code_snapshot text,
  discount_amount numeric(14, 2) not null check (discount_amount >= 0),
  currency text not null check (currency = 'EGP'),
  status text not null check (status in ('reserved', 'redeemed', 'cancelled', 'refunded')),
  recorded_at timestamptz not null,
  qualified_at timestamptz,
  constraint promotion_redemptions_qualified_at_check
    check ((status = 'redeemed') = (qualified_at is not null))
);

create index promotion_redemptions_capacity_idx
  on private.promotion_redemptions (promotion_id, status);
create index promotion_redemptions_account_capacity_idx
  on private.promotion_redemptions (promotion_id, account_id, status);
create index promotion_redemptions_analytics_idx
  on private.promotion_redemptions (promotion_id, qualified_at desc)
  where status = 'redeemed';

-- These rows are durable database-backed mutexes. The global lock is only
-- taken when a global cap exists; account locks serialize only the same
-- promotion/account pair. Rows are retained so concurrent INSERT ... ON
-- CONFLICT operations always converge on the same lock row.
create table private.promotion_redemption_global_locks (
  promotion_id uuid primary key references public.promotions (id) on delete cascade
);
create table private.promotion_redemption_account_locks (
  promotion_id uuid not null references public.promotions (id) on delete cascade,
  account_id uuid not null,
  primary key (promotion_id, account_id)
);
alter table private.promotion_redemption_global_locks enable row level security;
alter table private.promotion_redemption_account_locks enable row level security;
revoke all privileges on table private.promotion_redemption_global_locks,
  private.promotion_redemption_account_locks
  from public, anon, authenticated, service_role;

alter table private.promotion_redemptions enable row level security;
revoke all privileges on table private.promotion_redemptions
  from public, anon, authenticated, service_role;

insert into private.promotion_redemptions (
  promotion_id, order_id, account_id, order_number_snapshot, promotion_code_snapshot,
  discount_amount, currency, status, recorded_at, qualified_at
)
select order_row.promotion_id, order_row.id, order_row.user_id, order_row.order_number,
       order_row.promotion_code_snapshot, order_row.discount_amount, order_row.currency,
       case
         when order_row.order_status = 'cancelled' then 'cancelled'
         when order_row.payment_status = 'refunded' then 'refunded'
         when order_row.order_status = 'delivered'
              and order_row.payment_method = 'cod'
              and order_row.payment_status = 'paid' then 'redeemed'
         else 'reserved'
       end,
       order_row.created_at,
       case
         when order_row.order_status = 'delivered'
              and order_row.payment_method = 'cod'
              and order_row.payment_status = 'paid'
           then order_row.status_changed_at
         else null
       end
from public.orders as order_row
where order_row.promotion_id is not null;

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
       or (v_promotion.ends_at is not null and v_promotion.ends_at <= v_now)
       or v_subtotal < v_promotion.minimum_subtotal then
      raise exception using errcode = 'P0001', message = 'The promotion is invalid or not eligible for this order.';
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
      v_discount := pg_catalog.round(v_subtotal * v_promotion.discount_value / 100, 2);
      if v_promotion.maximum_discount is not null then
        v_discount := least(v_discount, v_promotion.maximum_discount);
      end if;
    else
      v_discount := least(v_subtotal, v_promotion.discount_value);
    end if;
    v_discount := least(v_discount, v_subtotal);
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

create function private.enforce_promotion_redemption_capacity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_maximum integer;
  v_account_limit integer;
  v_usage bigint;
begin
  if new.promotion_id is null then return new; end if;
  if new.user_id is null then
    raise exception using errcode = '28000',
      message = 'Authentication is required to redeem this promotion.';
  end if;

  -- A shared promotion-row lock keeps the eligibility and limit settings
  -- stable while allowing independent accounts to proceed concurrently.
  select promotion.maximum_redemptions, promotion.per_account_redemption_limit
    into v_maximum, v_account_limit
  from public.promotions as promotion
  where promotion.id = new.promotion_id
  for share;

  if not found then
    raise exception using errcode = '23503', message = 'The promotion is unavailable.';
  end if;

  -- Lock order is always promotion row, optional global-cap row, then account
  -- row. Counting occurs only after these locks, in a fresh SQL statement, so
  -- READ COMMITTED sees reservations committed by transactions we waited for.
  if v_maximum is not null then
    insert into private.promotion_redemption_global_locks (promotion_id)
    values (new.promotion_id) on conflict (promotion_id) do nothing;
    perform 1 from private.promotion_redemption_global_locks as lock_row
    where lock_row.promotion_id = new.promotion_id for update;
  end if;

  if v_account_limit is not null then
    insert into private.promotion_redemption_account_locks (promotion_id, account_id)
    values (new.promotion_id, new.user_id)
    on conflict (promotion_id, account_id) do nothing;
    perform 1 from private.promotion_redemption_account_locks as lock_row
    where lock_row.promotion_id = new.promotion_id
      and lock_row.account_id = new.user_id
    for update;
  end if;

  if v_maximum is not null then
    select pg_catalog.count(*) into v_usage
    from private.promotion_redemptions as redemption
    where redemption.promotion_id = new.promotion_id
      and redemption.status in ('reserved', 'redeemed', 'refunded');
    if v_usage >= v_maximum then
      raise exception using errcode = 'P0001',
        message = 'The promotion redemption limit has been reached.';
    end if;
  end if;

  if v_account_limit is not null then
    select pg_catalog.count(*) into v_usage
    from private.promotion_redemptions as redemption
    where redemption.promotion_id = new.promotion_id
      and redemption.account_id = new.user_id
      and redemption.status in ('reserved', 'redeemed', 'refunded');
    if v_usage >= v_account_limit then
      raise exception using errcode = 'P0001',
        message = 'The per-account promotion redemption limit has been reached.';
    end if;
  end if;

  return new;
end;
$$;

create function private.record_order_promotion_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.promotion_id is not null then
    insert into private.promotion_redemptions (
      promotion_id, order_id, account_id, order_number_snapshot, promotion_code_snapshot,
      discount_amount, currency, status, recorded_at
    ) values (
      new.promotion_id, new.id, new.user_id, new.order_number, new.promotion_code_snapshot,
      new.discount_amount, new.currency, 'reserved', new.created_at
    );
  end if;
  return new;
end;
$$;

create function private.update_order_promotion_redemption()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.promotion_id is not null then
    update private.promotion_redemptions as redemption
    set status = case
          when redemption.status = 'cancelled' or new.order_status = 'cancelled' then 'cancelled'
          when new.payment_status = 'refunded' then 'refunded'
          when new.order_status = 'delivered'
               and new.payment_method = 'cod'
               and new.payment_status = 'paid' then 'redeemed'
          else redemption.status
        end,
        qualified_at = case
          when new.order_status = 'cancelled' or new.payment_status = 'refunded' then null
          when redemption.status <> 'redeemed'
               and new.order_status = 'delivered'
               and new.payment_method = 'cod'
               and new.payment_status = 'paid'
            then pg_catalog.clock_timestamp()
          else redemption.qualified_at
        end
    where redemption.order_id = new.id;
  end if;
  return new;
end;
$$;

create trigger orders_enforce_promotion_redemption_capacity
  before insert on public.orders
  for each row execute function private.enforce_promotion_redemption_capacity();
create trigger orders_record_promotion_redemption
  after insert on public.orders
  for each row execute function private.record_order_promotion_redemption();
create trigger orders_update_promotion_redemption
  after update of order_status, payment_status on public.orders
  for each row execute function private.update_order_promotion_redemption();

revoke all on function private.enforce_promotion_redemption_capacity()
  from public, anon, authenticated, service_role;
revoke all on function private.record_order_promotion_redemption()
  from public, anon, authenticated, service_role;
revoke all on function private.update_order_promotion_redemption()
  from public, anon, authenticated, service_role;

create or replace function public.get_public_featured_promotions(p_limit integer default 24)
returns table (
  id uuid, code text, title text, description text, discount_type text,
  discount_value numeric, maximum_discount numeric, minimum_subtotal numeric,
  starts_at timestamptz, ends_at timestamptz, target_path text,
  maximum_redemptions integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select promotion.id, promotion.code, promotion.title, promotion.description,
         promotion.discount_type, promotion.discount_value, promotion.maximum_discount,
         promotion.minimum_subtotal, promotion.starts_at, promotion.ends_at,
         promotion.target_path, promotion.maximum_redemptions
  from public.promotions as promotion
  where promotion.is_featured and promotion.is_active
    and nullif(pg_catalog.btrim(promotion.code), '') is not null
    and nullif(pg_catalog.btrim(promotion.title), '') is not null
    and (promotion.starts_at is null or promotion.starts_at <= pg_catalog.statement_timestamp())
    and (promotion.ends_at is null or promotion.ends_at > pg_catalog.statement_timestamp())
    and (
      promotion.maximum_redemptions is null
      or (
        select pg_catalog.count(*)
        from private.promotion_redemptions as redemption
        where redemption.promotion_id = promotion.id
          and redemption.status in ('reserved', 'redeemed', 'refunded')
      ) < promotion.maximum_redemptions
    )
  order by promotion.display_priority desc, promotion.code asc
  limit LEAST(GREATEST(COALESCE(p_limit, 24), 1), 24);
$$;

create or replace function public.get_public_discount_announcements()
returns table (code text, discount_type text, discount_value numeric, minimum_subtotal numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select promotion.code, promotion.discount_type, promotion.discount_value,
         promotion.minimum_subtotal
  from public.promotions as promotion
  where promotion.is_announcement and promotion.is_active
    and (promotion.starts_at is null or promotion.starts_at <= pg_catalog.statement_timestamp())
    and (promotion.ends_at is null or promotion.ends_at > pg_catalog.statement_timestamp())
    and (
      promotion.maximum_redemptions is null
      or (
        select pg_catalog.count(*)
        from private.promotion_redemptions as redemption
        where redemption.promotion_id = promotion.id
          and redemption.status in ('reserved', 'redeemed', 'refunded')
      ) < promotion.maximum_redemptions
    )
  order by promotion.announcement_priority desc, promotion.code asc
  limit 6;
$$;

revoke all on function public.get_public_featured_promotions(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_featured_promotions(integer) to anon, authenticated;
revoke all on function public.get_public_discount_announcements()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_discount_announcements() to anon, authenticated;

-- Product deletion detaches the live reference while preserving snapshots.
-- Order deletion is only via the guarded admin RPC or trusted cleanup function.
create or replace function private.prevent_order_item_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and pg_catalog.pg_trigger_depth() > 1 then
    return old;
  end if;

  if tg_op = 'UPDATE'
     and pg_catalog.pg_trigger_depth() > 1
     and old.product_id is not null
     and new.product_id is null
     and row(
       new.id, new.order_id, new.product_name_snapshot, new.product_slug_snapshot,
       new.unit_price, new.quantity, new.line_total, new.created_at
     ) is not distinct from row(
       old.id, old.order_id, old.product_name_snapshot, old.product_slug_snapshot,
       old.unit_price, old.quantity, old.line_total, old.created_at
     ) then
    return new;
  end if;

  raise exception 'Order item snapshots are immutable' using errcode = '23514';
end;
$$;

create function private.hard_delete_order_rows(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.admin_notifications as notification
  where notification.order_id = p_order_id;
  delete from public.email_deliveries as delivery
  where delivery.order_id = p_order_id;
  delete from private.admin_order_email_deliveries as delivery
  where delivery.order_id = p_order_id;
  delete from private.order_inventory_restorations as restoration
  where restoration.order_id = p_order_id;
  delete from private.cod_order_idempotency as binding
  where binding.order_id = p_order_id;
  delete from private.order_status_events as event
  where event.order_id = p_order_id;
  delete from public.orders as order_row
  where order_row.id = p_order_id;
end;
$$;

revoke all on function private.hard_delete_order_rows(uuid)
  from public, anon, authenticated, service_role;

create function public.delete_admin_order(p_order_id uuid)
returns table (deleted boolean, order_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_number bigint;
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'The order identifier is invalid.';
  end if;

  select order_row.order_number into v_order_number
  from public.orders as order_row
  where order_row.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The order was not found.';
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

create table private.order_retention_cleanup_runs (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  batch_limit integer not null check (batch_limit between 1 and 500),
  deleted_count integer not null check (deleted_count >= 0),
  outcome text not null check (outcome in ('succeeded', 'failed')),
  sqlstate text check (sqlstate is null or sqlstate ~ '^[0-9A-Z]{5}$'),
  check ((outcome = 'succeeded') = (sqlstate is null))
);
alter table private.order_retention_cleanup_runs enable row level security;
revoke all privileges on table private.order_retention_cleanup_runs
  from public, anon, authenticated, service_role;

create function private.run_order_retention_cleanup(p_batch_limit integer default 100)
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
  v_order record;
begin
  if v_batch_limit < 1 or v_batch_limit > 500 then
    raise exception using errcode = '22023', message = 'The retention batch limit is invalid.';
  end if;

  begin
    for v_order in
      select order_row.id
      from public.orders as order_row
      where order_row.order_status in ('delivered', 'cancelled')
        and order_row.retention_started_at <= v_started_at - interval '45 days'
      order by order_row.retention_started_at, order_row.id
      for update of order_row skip locked
      limit v_batch_limit
    loop
      perform private.hard_delete_order_rows(v_order.id);
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

revoke all on function private.run_order_retention_cleanup(integer)
  from public, anon, authenticated, service_role;
grant execute on function private.run_order_retention_cleanup(integer) to postgres;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_extension as extension_row
    where extension_row.extname = 'pg_cron'
  ) or not exists (
    select 1 from pg_catalog.pg_namespace as schema_row
    where schema_row.nspname = 'cron'
  ) then
    raise exception 'Enable Supabase pg_cron before applying the order retention migration.';
  end if;
end;
$$;

do $$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid from cron.job as job
    where job.jobname = 'dr-beauty-order-retention-cleanup'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  -- pg_cron interprets this as 03:00 in the database's configured timezone
  -- (Supabase's default is UTC; verify the database setting before relying on it).
  perform cron.schedule(
    'dr-beauty-order-retention-cleanup',
    '0 3 * * *',
    'select private.run_order_retention_cleanup(100);'
  );
end;
$$;

commit;
