begin;

-- Route payment collection through the guarded RPC below rather than a direct
-- PostgREST column update from an authenticated browser session.
revoke update (payment_status) on public.orders from authenticated;

-- The lifecycle event table is deliberately private. Expose only the limited
-- event fields needed by the authenticated admin orders screen, after an
-- independent database-side administrator check.
create function public.get_admin_order_status_history(p_order_ids uuid[])
returns table (
  order_id uuid,
  event_id uuid,
  from_status text,
  to_status text,
  changed_at timestamptz,
  shipping_carrier text,
  tracking_number text,
  tracking_url text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  if p_order_ids is null
     or pg_catalog.cardinality(p_order_ids) < 1
     or pg_catalog.cardinality(p_order_ids) > 100
     or pg_catalog.array_position(p_order_ids, null) is not null then
    raise exception using errcode = '22023', message = 'The order selection is invalid.';
  end if;

  return query
  select event.order_id, event.id, event.from_status, event.to_status,
         event.changed_at, event.shipping_carrier, event.tracking_number,
         event.tracking_url
  from private.order_status_events as event
  where event.order_id = any (p_order_ids)
  order by event.order_id, event.changed_at, event.id;
end;
$$;

-- Record cash collection only after delivery. The row lock makes repeat calls
-- safe and prevents concurrent status/payment changes from being overwritten.
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
  v_order_number bigint;
  v_order_status text;
  v_payment_method text;
  v_payment_status text;
  v_newly_paid boolean := false;
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'The order identifier is invalid.';
  end if;

  select order_row.order_number, order_row.order_status,
         order_row.payment_method, order_row.payment_status
    into v_order_number, v_order_status, v_payment_method, v_payment_status
  from public.orders as order_row
  where order_row.id = p_order_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The order was not found.';
  end if;
  if v_payment_method <> 'cod' or v_order_status <> 'delivered' then
    raise exception using errcode = '23514', message = 'Only delivered cash-on-delivery orders can be collected.';
  end if;

  if v_payment_status = 'pending' then
    update public.orders as order_row
    set payment_status = 'paid'
    where order_row.id = p_order_id;
    v_payment_status := 'paid';
    v_newly_paid := true;
  elsif v_payment_status <> 'paid' then
    raise exception using errcode = '23514', message = 'This payment status requires reconciliation.';
  end if;

  order_number := v_order_number;
  order_status := v_order_status;
  payment_status := v_payment_status;
  newly_paid := v_newly_paid;
  return next;
end;
$$;

revoke all on function public.get_admin_order_status_history(uuid[])
  from public, anon, authenticated, service_role;
revoke all on function public.mark_cod_order_paid(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_order_status_history(uuid[])
  to authenticated;
grant execute on function public.mark_cod_order_paid(uuid)
  to authenticated;

commit;
