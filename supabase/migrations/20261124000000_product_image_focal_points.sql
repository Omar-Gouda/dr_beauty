begin;

alter table public.product_images
  add column focal_x numeric(5, 2) not null default 50
    check (focal_x between 0 and 100),
  add column focal_y numeric(5, 2) not null default 50
    check (focal_y between 0 and 100);

-- Keep the existing product, inventory, image replacement, and compare-at
-- writes in their current transaction, then persist per-image crop positions.
create function public.save_admin_product_with_image_focal_points(
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
  p_compare_at_price numeric,
  p_image_focal_points jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_product_id uuid;
  v_point jsonb;
  v_x text;
  v_y text;
  v_affected_rows integer;
begin
  if v_user_id is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator authorization is required.';
  end if;

  if p_image_urls is null or pg_catalog.cardinality(p_image_urls) not between 1 and 10
     or p_image_focal_points is null
     or pg_catalog.jsonb_typeof(p_image_focal_points) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_image_focal_points) <> pg_catalog.cardinality(p_image_urls) then
    raise exception using errcode = '22023', message = 'Product image positions are invalid.';
  end if;

  for v_point in select value from pg_catalog.jsonb_array_elements(p_image_focal_points) as point(value) loop
    if pg_catalog.jsonb_typeof(v_point) <> 'object' then
      raise exception using errcode = '22023', message = 'A product image position is invalid.';
    end if;
    v_x := v_point ->> 'x';
    v_y := v_point ->> 'y';
    if v_x is null or v_y is null
       or v_x !~ '^(100(\.0{1,2})?|[0-9]{1,2}(\.[0-9]{1,2})?)$'
       or v_y !~ '^(100(\.0{1,2})?|[0-9]{1,2}(\.[0-9]{1,2})?)$' then
      raise exception using errcode = '22023', message = 'A product image position must be between zero and one hundred.';
    end if;
  end loop;

  v_product_id := public.save_admin_product_with_compare_at(
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
    p_is_bestseller,
    p_compare_at_price
  );

  update public.product_images as image
  set focal_x = (position.value ->> 'x')::numeric,
      focal_y = (position.value ->> 'y')::numeric
  from pg_catalog.jsonb_array_elements(p_image_focal_points) with ordinality as position(value, ordinality)
  where image.product_id = v_product_id
    and image.sort_order = (position.ordinality - 1)::integer;
  get diagnostics v_affected_rows = row_count;
  if v_affected_rows <> pg_catalog.cardinality(p_image_urls) then
    raise exception using errcode = 'P0001', message = 'Product image positions could not be saved.';
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.save_admin_product_with_image_focal_points(
  uuid, text, text, text, text, uuid, numeric, text, text, integer, text[], boolean, boolean, numeric, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.save_admin_product_with_image_focal_points(
  uuid, text, text, text, text, uuid, numeric, text, text, integer, text[], boolean, boolean, numeric, jsonb
) to authenticated;

commit;
