begin;

-- Perform the admin delete through one server-side authorization boundary.
-- Existing foreign keys preserve historical rows, clean up product-owned
-- children, and reject any unhandled restrictive dependency transactionally.
create function public.delete_admin_product(p_product_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted_product_id uuid;
begin
  if v_user_id is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator authorization is required.';
  end if;
  if p_product_id is null then
    raise exception using errcode = '22023', message = 'A product id is required.';
  end if;

  delete from public.products as product
  where product.id = p_product_id
  returning product.id into v_deleted_product_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'The product was not found.';
  end if;
  return v_deleted_product_id;
end;
$$;

revoke all on function public.delete_admin_product(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_admin_product(uuid) to authenticated;

commit;
