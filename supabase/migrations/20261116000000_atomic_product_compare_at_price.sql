begin;

-- Extend the existing atomic product save with compare-at pricing. The legacy
-- save RPC remains unchanged; this wrapper calls it and writes the comparison
-- amount in the same transaction.
create function public.save_admin_product_with_compare_at(
  p_product_id uuid,
  p_name text,
  p_slug text,
  p_brand_name text,
  p_brand_slug text,
  p_category_id uuid,
  p_price numeric,
  p_description text,
  p_ingredients text,
  p_stock_quantity integer,
  p_image_urls text[],
  p_is_active boolean,
  p_is_bestseller boolean,
  p_compare_at_price numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_id uuid;
  v_affected_rows integer;
begin
  if v_user_id is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator authorization is required.';
  end if;

  if p_compare_at_price is not null and (
    p_compare_at_price <= 0
    or p_compare_at_price > 9999999999.99
    or p_compare_at_price <> pg_catalog.round(p_compare_at_price, 2)
    or p_price is null
    or p_compare_at_price <= p_price
  ) then
    raise exception using errcode = '22023', message = 'The compare-at price must be a valid amount greater than the selling price.';
  end if;

  -- The table check requires compare_at_price >= price. Clear an existing
  -- reference before the inner RPC changes price so repricing/removal can pass
  -- that check; any later error rolls this change back with the whole call.
  if p_product_id is not null then
    update public.products as product
    set compare_at_price = null
    where product.id = p_product_id
      and product.compare_at_price is not null;
  end if;

  v_product_id := public.save_admin_product(
    p_product_id,
    p_name,
    p_slug,
    p_brand_name,
    p_brand_slug,
    p_category_id,
    p_price,
    p_description,
    p_ingredients,
    p_stock_quantity,
    p_image_urls,
    p_is_active,
    p_is_bestseller
  );

  update public.products as product
  set compare_at_price = p_compare_at_price
  where product.id = v_product_id;
  get diagnostics v_affected_rows = row_count;
  if v_affected_rows <> 1 then
    raise exception using errcode = 'P0001', message = 'Product comparison price could not be saved.';
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.save_admin_product_with_compare_at(
  uuid, text, text, text, text, uuid, numeric, text, text, integer, text[], boolean, boolean, numeric
) from public, anon, authenticated, service_role;
grant execute on function public.save_admin_product_with_compare_at(
  uuid, text, text, text, text, uuid, numeric, text, text, integer, text[], boolean, boolean, numeric
) to authenticated;

commit;
