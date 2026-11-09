begin;

-- Order items are immutable while their order exists. Permit their removal
-- only as the ON DELETE CASCADE consequence of deleting the parent order.
create or replace function private.prevent_order_item_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and pg_catalog.pg_trigger_depth() > 1
     and not exists (
    select 1
    from public.orders as order_row
    where order_row.id = old.order_id
  ) then
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

-- Remove restrictive dependents before deleting the parent. Order items are
-- removed by their established ON DELETE CASCADE FK; promotion_redemptions
-- deliberately keeps its row and nulls order_id via ON DELETE SET NULL.
create or replace function private.hard_delete_order_rows(p_order_id uuid)
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

revoke all on function private.prevent_order_item_mutation()
  from public, anon, authenticated, service_role;
revoke all on function private.hard_delete_order_rows(uuid)
  from public, anon, authenticated, service_role;

commit;
