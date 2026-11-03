begin;

-- Storefronts need only a boolean stock state. Keep exact inventory quantities
-- behind the existing admin-only RLS policy.
create function public.get_public_product_availability(p_product_ids uuid[])
returns table (
  product_id uuid,
  is_available boolean
)
language plpgsql
security definer
set search_path = ''
stable
as $$
begin
  if p_product_ids is null
     or pg_catalog.cardinality(p_product_ids) > 1000
     or pg_catalog.array_position(p_product_ids, null) is not null then
    raise exception using errcode = '22023', message = 'The product selection is invalid.';
  end if;

  return query
  select product_row.id,
         coalesce(inventory.stock_quantity > 0, false)
  from public.products as product_row
  left join public.product_inventory as inventory
    on inventory.product_id = product_row.id
  where product_row.is_active
    and product_row.id = any (p_product_ids);
end;
$$;

revoke all on function public.get_public_product_availability(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_product_availability(uuid[])
  to anon, authenticated;

commit;
