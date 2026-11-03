begin;

create function public.save_admin_product(
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
  p_is_bestseller boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_brand_id uuid;
  v_brand_active boolean;
  v_product_id uuid;
  v_affected_rows integer;
  v_image text;
  v_url_match text[];
  v_authority text;
  v_host text;
begin
  if v_user_id is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator authorization is required.';
  end if;

  if p_name is null or pg_catalog.length(pg_catalog.btrim(p_name)) not between 1 and 240
     or p_slug is null or p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or p_brand_name is null or pg_catalog.length(pg_catalog.btrim(p_brand_name)) not between 1 and 120
     or p_category_id is null
     or p_price is null or p_price < 0 or p_price > 9999999999.99
     or p_price <> pg_catalog.round(p_price, 2)
     or p_stock_quantity is null or p_stock_quantity < 0
     or p_is_active is null or p_is_bestseller is null
     or p_description is not null and pg_catalog.length(pg_catalog.btrim(p_description)) > 10000
     or p_ingredients is not null and pg_catalog.length(pg_catalog.btrim(p_ingredients)) > 10000
     or p_image_urls is null or pg_catalog.array_ndims(p_image_urls) <> 1
     or pg_catalog.cardinality(p_image_urls) not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Product details are invalid.';
  end if;

  perform 1
  from public.categories as category
  where category.id = p_category_id
  for key share;
  if not found then
    raise exception using errcode = '22023', message = 'The selected category is unavailable.';
  end if;

  foreach v_image in array p_image_urls loop
    if v_image is null or pg_catalog.length(v_image) < 1 or pg_catalog.length(v_image) > 2048 then
      raise exception using errcode = '22023', message = 'A product image reference is invalid.';
    end if;

    if v_image ~* '^/images/[a-zA-Z0-9/_-]+\.(avif|gif|jpe?g|png|webp)$'
       and pg_catalog.strpos(v_image, '..') = 0 then
      continue;
    end if;

    v_url_match := pg_catalog.regexp_match(v_image, '^https://([^/?#]+)');
    if v_url_match is null then
      raise exception using errcode = '22023', message = 'A product image reference is invalid.';
    end if;
    v_authority := v_url_match[1];
    if pg_catalog.strpos(v_authority, '@') > 0
       or v_authority !~ '^[^:]+(:[0-9]{1,5})?$'
       or v_authority ~ '^\[' then
      raise exception using errcode = '22023', message = 'A product image URL is invalid.';
    end if;

    v_host := pg_catalog.lower(pg_catalog.regexp_replace(v_authority, ':[0-9]{1,5}$', ''));
    if v_host = 'localhost' or v_host like '%.localhost'
       or v_host like '%.local' or v_host like '%.internal'
       or v_host ~ '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' then
      raise exception using errcode = '22023', message = 'Product images must use public HTTPS hosts.';
    end if;
  end loop;

  -- Serialize same-name brand creation/activation. Any later error rolls this
  -- change back with the product, inventory, and image writes below.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(pg_catalog.lower(pg_catalog.btrim(p_brand_name)), 0)
  );
  select brand.id, brand.is_active
    into v_brand_id, v_brand_active
  from public.brands as brand
  where brand.name = pg_catalog.btrim(p_brand_name)
  for update;

  if found then
    if not v_brand_active then
      update public.brands as brand
      set is_active = true
      where brand.id = v_brand_id;
    end if;
  else
    if p_brand_slug is null or p_brand_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception using errcode = '22023', message = 'The brand name cannot be saved.';
    end if;
    insert into public.brands (name, slug, is_active)
    values (pg_catalog.btrim(p_brand_name), p_brand_slug, true)
    returning id into v_brand_id;
  end if;

  if p_product_id is null then
    insert into public.products (
      name, slug, brand_id, category_id, price, currency,
      description, ingredients, is_active, is_bestseller
    ) values (
      pg_catalog.btrim(p_name), p_slug, v_brand_id, p_category_id, p_price, 'EGP',
      nullif(pg_catalog.btrim(p_description), ''), nullif(pg_catalog.btrim(p_ingredients), ''),
      false, p_is_bestseller
    )
    returning id into v_product_id;
  else
    update public.products as product
    set name = pg_catalog.btrim(p_name),
        slug = p_slug,
        brand_id = v_brand_id,
        category_id = p_category_id,
        price = p_price,
        currency = 'EGP',
        description = nullif(pg_catalog.btrim(p_description), ''),
        ingredients = nullif(pg_catalog.btrim(p_ingredients), ''),
        is_active = false,
        is_bestseller = p_is_bestseller
    where product.id = p_product_id
    returning product.id into v_product_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'The product to edit was not found.';
    end if;
  end if;

  update public.product_inventory as inventory
  set stock_quantity = p_stock_quantity
  where inventory.product_id = v_product_id;
  get diagnostics v_affected_rows = row_count;
  if v_affected_rows <> 1 then
    raise exception using errcode = 'P0001', message = 'Product inventory could not be saved.';
  end if;

  delete from public.product_images as image
  where image.product_id = v_product_id;
  insert into public.product_images (product_id, image_url, alt_text, sort_order)
  select v_product_id, image.image_url, pg_catalog.btrim(p_name), (image.ordinality - 1)::integer
  from pg_catalog.unnest(p_image_urls) with ordinality as image(image_url, ordinality);

  if p_is_active then
    update public.products as product
    set is_active = true
    where product.id = v_product_id;
  end if;

  return v_product_id;
end;
$$;

revoke all on function public.save_admin_product(
  uuid, text, text, text, text, uuid, numeric, text, text, integer, text[], boolean, boolean
) from public, anon, authenticated, service_role;
grant execute on function public.save_admin_product(
  uuid, text, text, text, text, uuid, numeric, text, text, integer, text[], boolean, boolean
) to authenticated;

commit;
