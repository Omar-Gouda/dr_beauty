begin;

-- Product deletion invokes the ON DELETE SET NULL foreign-key action from a
-- nested referential-integrity trigger. Permit only that product reference
-- detachment when the complete remaining order-item row is unchanged.
-- Continue to permit item deletion only as the safe parent-order cascade.
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
     and (pg_catalog.to_jsonb(new) - 'product_id')
       is not distinct from (pg_catalog.to_jsonb(old) - 'product_id') then
    return new;
  end if;

  raise exception 'Order item snapshots are immutable' using errcode = '23514';
end;
$$;

commit;
