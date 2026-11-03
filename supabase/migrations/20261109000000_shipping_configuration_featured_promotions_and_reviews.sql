begin;

-- Preserve prior order totals: the old shipping_amount is the amount actually
-- charged. New orders also retain the undiscounted fee and shipping discount.
alter table public.orders
  add column shipping_discount_amount numeric(12, 2) not null default 0
    check (shipping_discount_amount >= 0),
  add column shipping_fee_amount numeric(12, 2)
    generated always as (shipping_amount + shipping_discount_amount) stored;

create table public.shipping_settings (
  id boolean primary key default true check (id is true),
  is_shipping_enabled boolean not null default true,
  default_fee numeric(12, 2) not null check (default_fee >= 0),
  free_shipping_minimum_subtotal numeric(12, 2)
    check (free_shipping_minimum_subtotal is null or free_shipping_minimum_subtotal >= 0),
  updated_at timestamptz not null default pg_catalog.now()
);

-- Seed the existing storefront rule as an explicit, editable business setting.
insert into public.shipping_settings (
  id, is_shipping_enabled, default_fee, free_shipping_minimum_subtotal
) values (true, true, 60, 1000)
on conflict (id) do nothing;

alter table public.shipping_settings enable row level security;
revoke all privileges on table public.shipping_settings
  from public, anon, authenticated, service_role;
grant select on table public.shipping_settings to anon, authenticated;
grant insert, update, delete on table public.shipping_settings to authenticated;
grant all privileges on table public.shipping_settings to service_role;

create policy shipping_settings_public_read on public.shipping_settings
  for select to anon, authenticated using (true);
create policy shipping_settings_admin_manage on public.shipping_settings
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create trigger shipping_settings_set_updated_at
  before update on public.shipping_settings
  for each row execute function private.set_updated_at();
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
alter table public.promotions
  add column title text check (title is null or pg_catalog.length(title) between 1 and 160),
  add column is_featured boolean not null default false,
  add column display_priority integer not null default 0
    check (display_priority between -1000000 and 1000000),
  add column target_path text not null default '/shop'
    check (
      target_path = '/shop'
      or target_path ~ '^/(products|categories)/[a-z0-9]+(-[a-z0-9]+)*$'
    );

alter table public.promotions
  add constraint promotions_featured_title_check
  check (not is_featured or title is not null);

alter table public.product_reviews
  alter column status set default 'approved';

-- Keep the baseline safety rule in PostgreSQL too, so a direct authenticated
-- table insert cannot bypass the Server Action's review validation.
create function private.validate_product_review_content()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.body is not distinct from old.body then
    return new;
  end if;

  if (coalesce(new.title, '') || ' ' || new.body) ~* '(^|[^[:alnum:]_])(i|we)[[:space:]]+(will|am going to|are going to|want to)[[:space:]]+(kill|hurt|attack|harm|rape|stab|shoot)[[:space:]]+(you|him|her|them|someone|somebody)($|[^[:alnum:]_])'
     or (coalesce(new.title, '') || ' ' || new.body) ~* '(^|[^[:alnum:]_])(i|we)[[:space:]]+(will|am going to|are going to)[[:space:]]+(burn|destroy)[[:space:]]+(your|their|his|her)[[:space:]]+(home|house|store|business)($|[^[:alnum:]_])' then
    raise exception using errcode = '22023',
      message = 'Review content is not allowed.';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_product_review_content() from public, anon, authenticated, service_role;
create trigger product_reviews_validate_content
  before insert or update on public.product_reviews
  for each row execute function private.validate_product_review_content();

drop policy product_reviews_insert_verified_purchase on public.product_reviews;
create policy product_reviews_insert_verified_purchase on public.product_reviews
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and status = 'approved'
    and (select private.has_purchased_product(product_id))
  );

commit;
