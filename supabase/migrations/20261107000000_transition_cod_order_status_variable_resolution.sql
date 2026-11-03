begin;

-- Resolve the RETURNS TABLE output variable / table-column collision in SQL statements.
create or replace function public.transition_cod_order_status(
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
#variable_conflict use_column
declare
  v_actor_id uuid;
  v_current_status text;
  v_new_status text;
  v_payment_status text;
  v_order_number bigint;
  v_customer_email text;
  v_customer_phone text;
  v_shipped_at timestamptz;
  v_cancelled_at timestamptz;
  v_status_changed_at timestamptz;
  v_inventory_restored_at timestamptz;
  v_carrier text;
  v_tracking_number text;
  v_tracking_url text;
  v_input_carrier text;
  v_input_tracking_number text;
  v_input_tracking_url text;
  v_next_carrier text;
  v_next_tracking_number text;
  v_next_tracking_url text;
  v_status_payload jsonb := '{}'::jsonb;
  v_item record;
  v_stock_quantity integer;
  v_item_count bigint;
  v_restoration_count bigint;
  v_whatsapp_consent boolean := false;
  v_whatsapp_consented_at timestamptz;
  v_whatsapp_consent_source text;
  v_whatsapp_consent_version text;
begin
  v_actor_id := auth.uid();
  if v_actor_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  v_new_status := nullif(pg_catalog.btrim(p_new_status), '');
  if v_new_status is null or v_new_status not in ('confirmed', 'processing', 'shipped', 'delivered', 'cancelled') then
    raise exception using errcode = '22023', message = 'The requested order status is invalid.';
  end if;

  if p_shipping_carrier is not null then
    v_input_carrier := nullif(pg_catalog.btrim(p_shipping_carrier), '');
    if v_input_carrier is null or pg_catalog.length(v_input_carrier) > 120 then
      raise exception using errcode = '22023', message = 'The shipping carrier is invalid.';
    end if;
  end if;
  if p_tracking_number is not null then
    v_input_tracking_number := nullif(pg_catalog.btrim(p_tracking_number), '');
    if v_input_tracking_number is null or pg_catalog.length(v_input_tracking_number) > 160 then
      raise exception using errcode = '22023', message = 'The tracking number is invalid.';
    end if;
  end if;
  if p_tracking_url is not null then
    v_input_tracking_url := nullif(pg_catalog.btrim(p_tracking_url), '');
    if v_input_tracking_url is null or pg_catalog.length(v_input_tracking_url) > 2048
       or v_input_tracking_url !~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?([/?#][^[:space:]]*)?$' then
      raise exception using errcode = '22023', message = 'The tracking URL must be a safe HTTPS URL.';
    end if;
  end if;

  -- Lock the order first; cancellation then locks inventory rows by product ID.
  select o.order_status, o.payment_status, o.order_number, o.customer_email, o.customer_phone,
         o.shipped_at, o.cancelled_at, o.status_changed_at,
         o.inventory_restored_at, o.shipping_carrier, o.tracking_number, o.tracking_url
    into v_current_status, v_payment_status, v_order_number, v_customer_email, v_customer_phone,
         v_shipped_at, v_cancelled_at, v_status_changed_at,
         v_inventory_restored_at, v_carrier, v_tracking_number, v_tracking_url
  from public.orders as o
  where o.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The order was not found.';
  end if;

  v_next_carrier := v_carrier;
  v_next_tracking_number := v_tracking_number;
  v_next_tracking_url := v_tracking_url;
  if p_shipping_carrier is not null then v_next_carrier := v_input_carrier; end if;
  if p_tracking_number is not null then v_next_tracking_number := v_input_tracking_number; end if;
  if p_tracking_url is not null then v_next_tracking_url := v_input_tracking_url; end if;

  if v_new_status = v_current_status then
    if v_new_status not in ('shipped', 'delivered') and
       (p_shipping_carrier is not null or p_tracking_number is not null or p_tracking_url is not null) then
      raise exception using errcode = '22023', message = 'Tracking details can only be set for shipped orders.';
    end if;
    if v_next_carrier is distinct from v_carrier
       or v_next_tracking_number is distinct from v_tracking_number
       or v_next_tracking_url is distinct from v_tracking_url then
      raise exception using errcode = '22023', message = 'Tracking changes require a real order status transition.';
    end if;
    order_number := v_order_number;
    order_status := v_current_status;
    status_changed_at := v_status_changed_at;
    shipped_at := v_shipped_at;
    cancelled_at := v_cancelled_at;
    shipping_carrier := v_carrier;
    tracking_number := v_tracking_number;
    tracking_url := v_tracking_url;
    inventory_restored_at := v_inventory_restored_at;
    return next;
    return;
  end if;

  if not (
    (v_current_status = 'pending_confirmation' and v_new_status in ('confirmed', 'cancelled'))
    or (v_current_status = 'confirmed' and v_new_status in ('processing', 'cancelled'))
    or (v_current_status = 'processing' and v_new_status in ('shipped', 'cancelled'))
    or (v_current_status = 'shipped' and v_new_status = 'delivered')
  ) then
    raise exception using errcode = '22023', message = 'This order status transition is not allowed.';
  end if;

  if v_new_status = 'cancelled' then
    if p_shipping_carrier is not null or p_tracking_number is not null or p_tracking_url is not null then
      raise exception using errcode = '22023', message = 'Tracking details cannot be changed while cancelling an order.';
    end if;
    if v_inventory_restored_at is not null then
      raise exception using errcode = '23514', message = 'Inventory for this order has already been restored.';
    end if;
    if v_payment_status not in ('pending', 'failed') then
      raise exception using errcode = '23514', message = 'This order cannot be cancelled until its payment is reconciled.';
    end if;

    select pg_catalog.count(*) into v_item_count
    from public.order_items as oi
    where oi.order_id = p_order_id;
    if v_item_count = 0 then
      raise exception using errcode = '23514', message = 'Order items are unavailable for safe inventory restoration.';
    end if;
    select pg_catalog.count(*) into v_restoration_count
    from private.order_inventory_restorations as restoration
    where restoration.order_id = p_order_id;
    if v_restoration_count <> 0 then
      raise exception using errcode = '23514', message = 'Inventory for this order already has a restoration record.';
    end if;

    for v_item in
      select oi.product_id, oi.quantity
      from public.order_items as oi
      where oi.order_id = p_order_id
      order by oi.product_id
    loop
      select inventory.stock_quantity into v_stock_quantity
      from public.product_inventory as inventory
      where inventory.product_id = v_item.product_id
      for update;
      if not found then
        raise exception using errcode = '23514', message = 'Inventory is unavailable; the order was not cancelled.';
      end if;
      if v_stock_quantity::bigint + v_item.quantity > 2147483647 then
        raise exception using errcode = '22003', message = 'Inventory cannot safely accept the restoration quantity.';
      end if;

      update public.product_inventory as inventory
      set stock_quantity = inventory.stock_quantity + v_item.quantity
      where inventory.product_id = v_item.product_id;

      insert into private.order_inventory_restorations (order_id, product_id, quantity)
      values (p_order_id, v_item.product_id, v_item.quantity);
    end loop;
    v_inventory_restored_at := pg_catalog.clock_timestamp();
    v_cancelled_at := v_inventory_restored_at;
  elsif v_new_status = 'shipped' then
    v_next_carrier := v_carrier;
    v_next_tracking_number := v_tracking_number;
    v_next_tracking_url := v_tracking_url;
    if p_shipping_carrier is not null then v_next_carrier := v_input_carrier; end if;
    if p_tracking_number is not null then v_next_tracking_number := v_input_tracking_number; end if;
    if p_tracking_url is not null then v_next_tracking_url := v_input_tracking_url; end if;
    if v_next_tracking_number is null then
      raise exception using errcode = '22023', message = 'A tracking number is required before shipping this order.';
    end if;
    v_shipped_at := pg_catalog.clock_timestamp();
  elsif v_new_status = 'delivered' then
    v_next_carrier := v_carrier;
    v_next_tracking_number := v_tracking_number;
    v_next_tracking_url := v_tracking_url;
    if p_shipping_carrier is not null then v_next_carrier := v_input_carrier; end if;
    if p_tracking_number is not null then v_next_tracking_number := v_input_tracking_number; end if;
    if p_tracking_url is not null then v_next_tracking_url := v_input_tracking_url; end if;
    if v_next_tracking_number is null then
      raise exception using errcode = '23514', message = 'Shipped order tracking details are unavailable.';
    end if;
  elsif p_shipping_carrier is not null or p_tracking_number is not null or p_tracking_url is not null then
    raise exception using errcode = '22023', message = 'Tracking details can only be set for shipped orders.';
  end if;

  v_status_changed_at := pg_catalog.clock_timestamp();
  update public.orders as o
  set order_status = v_new_status,
      status_changed_at = v_status_changed_at,
      shipped_at = v_shipped_at,
      cancelled_at = v_cancelled_at,
      inventory_restored_at = v_inventory_restored_at,
      shipping_carrier = v_next_carrier,
      tracking_number = v_next_tracking_number,
      tracking_url = v_next_tracking_url
  where o.id = p_order_id;

  insert into private.order_status_events (
    order_id, from_status, to_status, changed_by, changed_at,
    shipping_carrier, tracking_number, tracking_url
  ) values (
    p_order_id, v_current_status, v_new_status, v_actor_id, v_status_changed_at,
    v_next_carrier, v_next_tracking_number, v_next_tracking_url
  );

  if v_new_status = 'shipped' then
    v_status_payload := pg_catalog.jsonb_build_object(
      'carrier', v_next_carrier,
      'tracking_number', v_next_tracking_number,
      'tracking_url', v_next_tracking_url
    );
  end if;

  if v_customer_email is not null and pg_catalog.length(v_customer_email) between 3 and 320 then
    insert into public.email_deliveries (
      order_id, delivery_type, recipient_email, idempotency_key,
      channel, order_status, status_payload
    ) values (
      p_order_id,
      'order_update',
      v_customer_email,
      'order-update:email:' || p_order_id::text || ':' || v_new_status,
      'email',
      v_new_status,
      v_status_payload
    )
    on conflict (order_id, delivery_type, channel, order_status)
      where order_id is not null and delivery_type = 'order_update' and order_status is not null
    do nothing;
  end if;

  select binding.whatsapp_consent into v_whatsapp_consent
  from private.cod_order_idempotency as binding
  where binding.order_id = p_order_id and binding.user_id is not null;

  if coalesce(v_whatsapp_consent, false) then
    select confirmation.consented_at, confirmation.consent_source, confirmation.consent_version
      into v_whatsapp_consented_at, v_whatsapp_consent_source, v_whatsapp_consent_version
    from public.email_deliveries as confirmation
    where confirmation.order_id = p_order_id
      and confirmation.channel = 'whatsapp'
      and confirmation.delivery_type = 'order_confirmation';

    -- Consent is valid only when the original consent-bound queue evidence is
    -- still present. Missing evidence suppresses WhatsApp delivery.
    if found and v_whatsapp_consented_at is not null
       and v_whatsapp_consent_source = 'checkout'
       and v_whatsapp_consent_version = 'cod-order-whatsapp-v1' then
      insert into public.email_deliveries (
        order_id, delivery_type, recipient_phone, idempotency_key,
        channel, order_status, status_payload,
        consented_at, consent_source, consent_version
      ) values (
        p_order_id,
        'order_update',
        v_customer_phone,
        'order-update:whatsapp:' || p_order_id::text || ':' || v_new_status,
        'whatsapp',
        v_new_status,
        v_status_payload,
        v_whatsapp_consented_at,
        v_whatsapp_consent_source,
        v_whatsapp_consent_version
      )
      on conflict (order_id, delivery_type, channel, order_status)
        where order_id is not null and delivery_type = 'order_update' and order_status is not null
      do nothing;
    end if;
  end if;

  order_number := v_order_number;
  order_status := v_new_status;
  status_changed_at := v_status_changed_at;
  shipped_at := v_shipped_at;
  cancelled_at := v_cancelled_at;
  shipping_carrier := v_next_carrier;
  tracking_number := v_next_tracking_number;
  tracking_url := v_next_tracking_url;
  inventory_restored_at := v_inventory_restored_at;
  return next;
end;
$$;

commit;
