begin;

-- Keep request bindings outside the Data API's public schema and deny direct
-- access even if the private schema is accidentally exposed later.
create table private.cod_order_idempotency (
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  order_id uuid not null references public.orders (id) on delete restrict,
  request_payload jsonb not null check (pg_catalog.jsonb_typeof(request_payload) = 'object'),
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key),
  unique (order_id)
);

alter table private.cod_order_idempotency enable row level security;
revoke all on table private.cod_order_idempotency from public, anon, authenticated, service_role;

-- JSONB equality is reliable and avoids depending on an optional hash extension.
-- Item order is canonicalized by product UUID; all accepted fields are trimmed,
-- and promotion codes are case-folded to match the RPC's lookup semantics.
create function private.cod_order_request_payload(
  p_items jsonb,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_governorate text,
  p_city text,
  p_address_line text,
  p_delivery_notes text,
  p_promotion_code text
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_build_object(
    'items', coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'product_id', requested.product_id::text,
            'quantity', requested.quantity
          ) order by requested.product_id
        )
        from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
      ),
      '[]'::jsonb
    ),
    'customer_name', pg_catalog.btrim(p_customer_name),
    'customer_email', p_customer_email,
    'customer_phone', pg_catalog.btrim(p_customer_phone),
    'governorate', pg_catalog.btrim(p_governorate),
    'city', pg_catalog.btrim(p_city),
    'address_line', pg_catalog.btrim(p_address_line),
    'delivery_notes', nullif(pg_catalog.btrim(p_delivery_notes), ''),
    'promotion_code', nullif(pg_catalog.lower(pg_catalog.btrim(p_promotion_code)), '')
  );
$$;

revoke all on function private.cod_order_request_payload(jsonb, text, text, text, text, text, text, text, text)
  from public, anon, authenticated, service_role;

-- Bind any idempotent orders created by the previous migration to the payload
-- recoverable from their immutable order and order-item snapshots.
insert into private.cod_order_idempotency (user_id, idempotency_key, order_id, request_payload)
select
  o.user_id,
  o.idempotency_key,
  o.id,
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
from public.orders as o
where o.idempotency_key is not null and o.user_id is not null
on conflict (user_id, idempotency_key) do nothing;

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

  v_shipping := case when v_subtotal > 1000 then 0 else 60 end;
  v_now := pg_catalog.clock_timestamp();
  if p_promotion_code is not null and pg_catalog.btrim(p_promotion_code) <> '' then
    select promotion.* into v_promotion
    from public.promotions as promotion
    where pg_catalog.lower(promotion.code) = pg_catalog.lower(pg_catalog.btrim(p_promotion_code))
    for update;

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
        v_discount := pg_catalog.least(v_discount, v_promotion.maximum_discount);
      end if;
    else
      v_discount := pg_catalog.least(v_subtotal, v_promotion.discount_value);
    end if;
    v_discount := pg_catalog.least(v_discount, v_subtotal);
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
    subtotal, shipping_amount, discount_amount, currency
  ) values (
    v_user_id, p_idempotency_key, v_promotion_id, v_promotion_code,
    pg_catalog.btrim(p_customer_name), v_customer_email, pg_catalog.btrim(p_customer_phone),
    pg_catalog.btrim(p_governorate), pg_catalog.btrim(p_city),
    pg_catalog.btrim(p_address_line), nullif(pg_catalog.btrim(p_delivery_notes), ''),
    'cod', 'pending', 'pending_confirmation', v_subtotal, v_shipping, v_discount, 'EGP'
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

revoke all on function public.create_cod_order(jsonb, uuid, text, text, text, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.create_cod_order(jsonb, uuid, text, text, text, text, text, text, text)
  to authenticated;

commit;
