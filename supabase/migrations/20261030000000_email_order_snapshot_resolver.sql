begin;

create function public.resolve_order_email_snapshot(
  p_delivery_id uuid,
  p_claim_token uuid
)
returns table (
  delivery_id uuid,
  channel text,
  delivery_type text,
  recipient_email text,
  idempotency_key text,
  notification_status text,
  notification_event_at timestamptz,
  event_from_status text,
  order_number bigint,
  customer_name text,
  order_created_at timestamptz,
  current_order_status text,
  currency text,
  subtotal numeric(14, 2),
  shipping_amount numeric(12, 2),
  discount_amount numeric(14, 2),
  total_amount numeric(14, 2),
  item_id uuid,
  product_name_snapshot text,
  product_slug_snapshot text,
  quantity integer,
  unit_price numeric(12, 2),
  line_total numeric(14, 2),
  shipping_carrier text,
  tracking_number text,
  tracking_url text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_delivery_channel text;
  v_delivery_type text;
  v_delivery_recipient text;
  v_delivery_key text;
  v_delivery_status text;
  v_status_payload jsonb;
  v_delivery_event_id uuid;
  v_campaign_id uuid;
  v_subscriber_id uuid;
  v_delivery_state text;
  v_claim_token uuid;
  v_locked_until timestamptz;
  v_order_email text;
  v_order_subtotal numeric(14, 2);
  v_order_shipping numeric(12, 2);
  v_order_discount numeric(14, 2);
  v_order_total numeric(14, 2);
  v_item_count bigint;
  v_item_total numeric;
  v_event_from_status text;
  v_event_to_status text;
  v_event_at timestamptz;
  v_event_carrier text;
  v_event_tracking_number text;
  v_event_tracking_url text;
  v_item record;
begin
  if p_delivery_id is null or p_claim_token is null then
    raise exception using errcode = 'P0001',
      message = 'The email notification snapshot is unavailable.';
  end if;

  select
    delivery.id,
    delivery.order_id,
    delivery.channel,
    delivery.delivery_type,
    delivery.recipient_email,
    delivery.idempotency_key,
    delivery.order_status,
    delivery.status_payload,
    delivery.status_event_id,
    delivery.campaign_id,
    delivery.subscriber_id,
    delivery.status,
    delivery.claim_token,
    delivery.locked_until,
    order_row.order_number,
    order_row.customer_name,
    order_row.customer_email,
    order_row.created_at,
    order_row.order_status,
    order_row.currency,
    order_row.subtotal,
    order_row.shipping_amount,
    order_row.discount_amount,
    order_row.total_amount
  into
    delivery_id,
    v_order_id,
    v_delivery_channel,
    v_delivery_type,
    v_delivery_recipient,
    v_delivery_key,
    v_delivery_status,
    v_status_payload,
    v_delivery_event_id,
    v_campaign_id,
    v_subscriber_id,
    v_delivery_state,
    v_claim_token,
    v_locked_until,
    order_number,
    customer_name,
    v_order_email,
    order_created_at,
    current_order_status,
    currency,
    v_order_subtotal,
    v_order_shipping,
    v_order_discount,
    v_order_total
  from public.email_deliveries as delivery
  join public.orders as order_row
    on order_row.id = delivery.order_id
  where delivery.id = p_delivery_id
  for update of delivery;

  if not found
     or v_claim_token is distinct from p_claim_token
     or v_locked_until is null
     or v_locked_until <= pg_catalog.clock_timestamp()
     or v_delivery_state is distinct from 'processing'
     or v_delivery_channel is distinct from 'email'
     or v_delivery_type not in ('order_confirmation', 'order_update')
     or v_order_id is null
     or v_campaign_id is not null
     or v_subscriber_id is not null
     or v_delivery_key is null
     or pg_catalog.length(v_delivery_key) not between 1 and 200 then
    raise exception using errcode = 'P0001',
      message = 'The email notification snapshot is unavailable.';
  end if;

  if v_delivery_recipient is null
     or pg_catalog.length(v_delivery_recipient) not between 3 and 320
     or v_order_email is null
     or v_delivery_recipient is distinct from v_order_email
     or v_delivery_recipient <> pg_catalog.btrim(v_delivery_recipient)
     or customer_name is null
     or pg_catalog.btrim(customer_name) = ''
     or order_number < 1
     or order_created_at is null
     or current_order_status not in (
       'pending_confirmation', 'confirmed', 'processing',
       'shipped', 'delivered', 'cancelled'
     )
     or currency is distinct from 'EGP'
     or v_order_subtotal is null
     or v_order_shipping is null
     or v_order_discount is null
     or v_order_total is null then
    raise exception using errcode = 'P0001',
      message = 'The email notification snapshot is unavailable.';
  end if;

  select pg_catalog.count(*), coalesce(pg_catalog.sum(item.line_total), 0)
    into v_item_count, v_item_total
  from public.order_items as item
  where item.order_id = v_order_id;

  if v_item_count < 1
     or v_item_total is distinct from v_order_subtotal
     or v_order_total is distinct from
       (v_order_subtotal + v_order_shipping - v_order_discount)::numeric(14, 2) then
    raise exception using errcode = 'P0001',
      message = 'The email notification snapshot is unavailable.';
  end if;

  notification_status := v_delivery_status;
  event_from_status := null;
  notification_event_at := order_created_at;
  shipping_carrier := null;
  tracking_number := null;
  tracking_url := null;

  if v_delivery_type = 'order_confirmation' then
    if v_delivery_status is not null
       or v_delivery_event_id is not null
       or v_status_payload is distinct from '{}'::jsonb then
      raise exception using errcode = 'P0001',
        message = 'The email notification snapshot is unavailable.';
    end if;
  else
    if v_delivery_status is null or v_delivery_event_id is null then
      raise exception using errcode = 'P0001',
        message = 'The email notification snapshot is unavailable.';
    end if;

    select event.from_status, event.to_status, event.changed_at,
      event.shipping_carrier, event.tracking_number, event.tracking_url
      into v_event_from_status, v_event_to_status, v_event_at,
        v_event_carrier, v_event_tracking_number, v_event_tracking_url
    from private.order_status_events as event
    where event.id = v_delivery_event_id
      and event.order_id = v_order_id
      and event.to_status = v_delivery_status
    for share;

    if not found
       or v_event_at is null
       or not coalesce((
         (v_event_from_status = 'pending_confirmation'
           and v_event_to_status in ('confirmed', 'cancelled'))
         or (v_event_from_status = 'confirmed'
           and v_event_to_status in ('processing', 'cancelled'))
         or (v_event_from_status = 'processing'
           and v_event_to_status in ('shipped', 'cancelled'))
         or (v_event_from_status = 'shipped'
           and v_event_to_status = 'delivered')
       ), false) then
      raise exception using errcode = 'P0001',
        message = 'The email notification snapshot is unavailable.';
    end if;

    notification_event_at := v_event_at;
    event_from_status := v_event_from_status;

    if v_event_to_status = 'shipped' then
      if v_event_tracking_number is null
         or pg_catalog.length(v_event_tracking_number) not between 1 and 160
         or v_event_tracking_number <> pg_catalog.btrim(v_event_tracking_number)
         or (v_event_carrier is not null and (
           pg_catalog.length(v_event_carrier) not between 1 and 120
           or v_event_carrier <> pg_catalog.btrim(v_event_carrier)
         ))
         or (v_event_tracking_url is not null and (
           pg_catalog.length(v_event_tracking_url) not between 9 and 2048
           or v_event_tracking_url <> pg_catalog.btrim(v_event_tracking_url)
           or v_event_tracking_url !~* '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:[0-9]{1,5})?([/?#][^[:space:]]*)?$'
         ))
         or v_status_payload is distinct from pg_catalog.jsonb_build_object(
           'carrier', v_event_carrier,
           'tracking_number', v_event_tracking_number,
           'tracking_url', v_event_tracking_url
         ) then
        raise exception using errcode = 'P0001',
          message = 'The email notification snapshot is unavailable.';
      end if;
      shipping_carrier := v_event_carrier;
      tracking_number := v_event_tracking_number;
      tracking_url := v_event_tracking_url;
    elsif v_status_payload is distinct from '{}'::jsonb then
      raise exception using errcode = 'P0001',
        message = 'The email notification snapshot is unavailable.';
    end if;
  end if;

  channel := v_delivery_channel;
  delivery_type := v_delivery_type;
  recipient_email := v_delivery_recipient;
  idempotency_key := v_delivery_key;
  subtotal := v_order_subtotal;
  shipping_amount := v_order_shipping;
  discount_amount := v_order_discount;
  total_amount := v_order_total;

  for v_item in
    select item.id, item.product_name_snapshot, item.product_slug_snapshot,
      item.quantity, item.unit_price, item.line_total
    from public.order_items as item
    where item.order_id = v_order_id
    order by item.created_at, item.id
  loop
    if v_item.product_name_snapshot is null
       or pg_catalog.btrim(v_item.product_name_snapshot) = ''
       or v_item.product_slug_snapshot is null
       or pg_catalog.btrim(v_item.product_slug_snapshot) = ''
       or v_item.quantity not between 1 and 999
       or v_item.unit_price < 0
       or v_item.line_total is distinct from (v_item.unit_price * v_item.quantity)::numeric(14, 2) then
      raise exception using errcode = 'P0001',
        message = 'The email notification snapshot is unavailable.';
    end if;

    item_id := v_item.id;
    product_name_snapshot := v_item.product_name_snapshot;
    product_slug_snapshot := v_item.product_slug_snapshot;
    quantity := v_item.quantity;
    unit_price := v_item.unit_price;
    line_total := v_item.line_total;
    return next;
  end loop;
end;
$$;

revoke all on function public.resolve_order_email_snapshot(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.resolve_order_email_snapshot(uuid, uuid)
  to service_role;

commit;
