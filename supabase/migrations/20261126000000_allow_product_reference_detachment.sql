begin;

-- Product deletion uses ON DELETE SET NULL for order_items.product_id. Permit
-- only that reference detachment when every historical snapshot field stays
-- byte-for-byte unchanged. Keep order-item deletion restricted to an order's
-- parent cascade, as in the existing safe order-delete migration.
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

commit;
