begin;

-- A status transition is one-way per order under transition_cod_order_status.
-- Enforce that relationship in the database so an update delivery can be
-- linked deterministically to exactly one persisted transition event.
do $$
begin
  if exists (
    select 1
    from private.order_status_events as event
    group by event.order_id, event.to_status
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'Cannot link notification events: duplicate order status events exist.';
  end if;

  if exists (
    select 1
    from public.email_deliveries as delivery
    left join private.order_status_events as event
      on event.order_id = delivery.order_id
     and event.to_status = delivery.order_status
    where delivery.delivery_type = 'order_update'
    group by delivery.id
    having pg_catalog.count(event.id) <> 1
  ) then
    raise exception 'Cannot link notification events: an order update has no unique matching status event.';
  end if;

  if exists (
    select 1
    from public.email_deliveries as delivery
    join private.order_status_events as event
      on event.order_id = delivery.order_id
     and event.to_status = delivery.order_status
    where delivery.delivery_type = 'order_update'
      and (
        (delivery.order_status = 'shipped'
          and delivery.status_payload is distinct from pg_catalog.jsonb_build_object(
            'carrier', event.shipping_carrier,
            'tracking_number', event.tracking_number,
            'tracking_url', event.tracking_url
          ))
        or (delivery.order_status <> 'shipped'
          and delivery.status_payload is distinct from '{}'::jsonb)
      )
  ) then
    raise exception 'Cannot link notification events: an order update payload disagrees with its status event.';
  end if;
end;
$$;

create unique index order_status_events_order_to_status_uidx
  on private.order_status_events (order_id, to_status);

alter table public.email_deliveries
  add column status_event_id uuid;

-- Only exact order/status matches are used. The checks above ensure every
-- update has exactly one match and that shipment facts agree before backfill.
update public.email_deliveries as delivery
set status_event_id = event.id
from private.order_status_events as event
where delivery.delivery_type = 'order_update'
  and event.order_id = delivery.order_id
  and event.to_status = delivery.order_status;

alter table public.email_deliveries
  add constraint email_deliveries_status_event_fk
    foreign key (status_event_id)
    references private.order_status_events (id)
    on delete restrict,
  add constraint email_deliveries_status_event_type_check
    check (
      (delivery_type = 'order_update' and status_event_id is not null)
      or (delivery_type <> 'order_update' and status_event_id is null)
    );

create index email_deliveries_status_event_idx
  on public.email_deliveries (status_event_id)
  where status_event_id is not null;

create function private.associate_order_notification_status_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_event_carrier text;
  v_event_tracking_number text;
  v_event_tracking_url text;
begin
  if new.delivery_type <> 'order_update' then
    if new.status_event_id is not null then
      raise exception using
        errcode = '23514',
        message = 'Only order update deliveries may reference a status event.';
    end if;
    return new;
  end if;

  if new.order_id is null or new.order_status is null then
    raise exception using
      errcode = '23514',
      message = 'An order update requires an order and status event.';
  end if;

  select event.id, event.shipping_carrier, event.tracking_number, event.tracking_url
    into v_event_id, v_event_carrier, v_event_tracking_number, v_event_tracking_url
  from private.order_status_events as event
  where event.order_id = new.order_id
    and event.to_status = new.order_status;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'The order update has no matching status event.';
  end if;

  if (new.order_status = 'shipped'
      and new.status_payload is distinct from pg_catalog.jsonb_build_object(
        'carrier', v_event_carrier,
        'tracking_number', v_event_tracking_number,
        'tracking_url', v_event_tracking_url
      ))
     or (new.order_status <> 'shipped'
      and new.status_payload is distinct from '{}'::jsonb) then
    raise exception using
      errcode = '23514',
      message = 'The order update payload does not match its status event.';
  end if;

  if tg_op = 'UPDATE' then
    if old.status_event_id is distinct from v_event_id then
      raise exception using
        errcode = '23514',
        message = 'An order update status event cannot be reassigned.';
    end if;
  end if;
  if new.status_event_id is not null and new.status_event_id is distinct from v_event_id then
    raise exception using
      errcode = '23514',
      message = 'The supplied order status event does not match the order update.';
  end if;

  new.status_event_id := v_event_id;
  return new;
end;
$$;

revoke all on function private.associate_order_notification_status_event()
  from public, anon, authenticated, service_role;

create trigger email_deliveries_associate_status_event_insert
  before insert on public.email_deliveries
  for each row execute function private.associate_order_notification_status_event();

create trigger email_deliveries_associate_status_event_update
  before update of order_id, delivery_type, order_status, status_payload, status_event_id
  on public.email_deliveries
  for each row execute function private.associate_order_notification_status_event();

commit;
