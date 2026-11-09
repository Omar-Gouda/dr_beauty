begin;

-- Stored generated columns are computed after BEFORE triggers. Compare the
-- persisted historical total to the value implied by the unchanged base
-- fields instead of reading NEW.line_total in this BEFORE UPDATE trigger.
-- Preserve the existing parent-order cascade exception.
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
     and (pg_catalog.to_jsonb(new) - 'product_id' - 'line_total')
       is not distinct from
         (pg_catalog.to_jsonb(old) - 'product_id' - 'line_total')
     and old.line_total is not distinct from
       (new.unit_price * new.quantity)::numeric(14, 2) then
    return new;
  end if;

  raise exception 'Order item snapshots are immutable' using errcode = '23514';
end;
$$;

commit;
