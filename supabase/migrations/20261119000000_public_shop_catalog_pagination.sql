begin;

create function public.get_public_shop_catalog(
  p_query text,
  p_category_slug text,
  p_brand_slugs text[],
  p_sort text,
  p_rating_min numeric,
  p_page integer,
  p_page_size integer
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with params as (
    select
      pg_catalog.left(pg_catalog.btrim(coalesce(p_query, '')), 160) as query_text,
      nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_category_slug, ''))), '') as category_slug,
      p_brand_slugs as brand_slugs,
      case when p_sort in ('featured', 'price-low', 'price-high', 'rating')
        then p_sort else 'featured' end as sort_order,
      case when p_rating_min in (3.5, 4.0, 4.5) then p_rating_min else null end as rating_min,
      least(greatest(coalesce(p_page, 1), 1), 1000) as requested_page,
      least(greatest(coalesce(p_page_size, 24), 1), 48) as page_size
  ),
  base_products as (
    select
      product_row.id,
      product_row.category_id,
      product_row.slug,
      product_row.name,
      product_row.description,
      product_row.ingredients,
      product_row.price,
      product_row.compare_at_price,
      product_row.currency,
      product_row.is_bestseller,
      product_row.created_at,
      category_row.slug as category_slug,
      category_row.name as category_name,
      brand_row.slug as brand_slug,
      brand_row.name as brand_name,
      review_stats.rating,
      review_stats.review_count
    from public.products as product_row
    left join public.categories as category_row
      on category_row.id = product_row.category_id
    left join public.brands as brand_row
      on brand_row.id = product_row.brand_id
    left join lateral (
      select
        pg_catalog.round(pg_catalog.avg(review_row.rating)::numeric, 1) as rating,
        pg_catalog.count(*) as review_count
      from public.product_reviews as review_row
      where review_row.product_id = product_row.id
        and review_row.status = 'approved'
    ) as review_stats on true
    cross join params
    where product_row.is_active
      and (params.category_slug is null or category_row.slug = params.category_slug)
      and (
        params.brand_slugs is null
        or pg_catalog.cardinality(params.brand_slugs) = 0
        or (
          pg_catalog.cardinality(params.brand_slugs) <= 20
          and brand_row.slug = any(params.brand_slugs)
        )
      )
      and (
        params.query_text = ''
        or pg_catalog.strpos(
          pg_catalog.lower(pg_catalog.concat_ws(
            ' ', product_row.name, brand_row.name, category_row.name,
            product_row.description, product_row.ingredients
          )),
          pg_catalog.lower(params.query_text)
        ) > 0
      )
  ),
  filtered_products as (
    select base_products.*
    from base_products
    cross join params
    where params.rating_min is null or base_products.rating >= params.rating_min
  ),
  numbered_products as (
    select
      filtered_products.*,
      pg_catalog.row_number() over (
        order by
          case when params.sort_order = 'featured' then filtered_products.is_bestseller end desc nulls last,
          case when params.sort_order = 'price-low' then filtered_products.price end asc nulls last,
          case when params.sort_order = 'price-high' then filtered_products.price end desc nulls last,
          case when params.sort_order = 'rating' then filtered_products.rating end desc nulls last,
          filtered_products.created_at desc,
          filtered_products.id asc
      ) as row_number
    from filtered_products
    cross join params
  ),
  summary as (
    select
      (select pg_catalog.count(*) from filtered_products) as total_count,
      exists (select 1 from base_products where base_products.review_count > 0) as ratings_available
  ),
  page_counts as (
    select
      summary.total_count,
      least(
        pg_catalog.ceil(summary.total_count::numeric / params.page_size),
        1000
      )::integer as total_pages,
      summary.ratings_available
    from summary
    cross join params
  ),
  page_info as (
    select
      page_counts.total_count,
      case
        when page_counts.total_count = 0 then 1
        else least(params.requested_page, page_counts.total_pages)
      end as current_page,
      page_counts.total_pages,
      params.page_size,
      page_counts.ratings_available
    from page_counts
    cross join params
  ),
  page_products as (
    select numbered_products.*
    from numbered_products
    cross join page_info
    where numbered_products.row_number > (page_info.current_page::bigint - 1) * page_info.page_size::bigint
      and numbered_products.row_number <= page_info.current_page::bigint * page_info.page_size::bigint
  )
  select pg_catalog.jsonb_build_object(
    'products',
    coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', page_product.id,
          'category_id', page_product.category_id,
          'slug', page_product.slug,
          'name', page_product.name,
          'description', page_product.description,
          'ingredients', page_product.ingredients,
          'price', page_product.price,
          'compare_at_price', page_product.compare_at_price,
          'currency', page_product.currency,
          'is_bestseller', page_product.is_bestseller,
          'category', case when page_product.category_slug is null then null else
            pg_catalog.jsonb_build_object('slug', page_product.category_slug, 'name', page_product.category_name) end,
          'brand', case when page_product.brand_name is null then null else
            pg_catalog.jsonb_build_object('name', page_product.brand_name) end,
          'images', coalesce((
            select pg_catalog.jsonb_agg(
              pg_catalog.jsonb_build_object('image_url', image_row.image_url, 'sort_order', image_row.sort_order)
              order by image_row.sort_order, image_row.id
            )
            from public.product_images as image_row
            where image_row.product_id = page_product.id
          ), '[]'::jsonb),
          'rating', page_product.rating,
          'reviews', page_product.review_count
        ) order by page_product.row_number
      )
      from page_products as page_product
    ), '[]'::jsonb),
    'totalCount', page_info.total_count,
    'page', page_info.current_page,
    'pageSize', page_info.page_size,
    'totalPages', page_info.total_pages,
    'ratingsAvailable', page_info.ratings_available
  )
  from page_info;
$$;

revoke all on function public.get_public_shop_catalog(text, text, text[], text, numeric, integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_shop_catalog(text, text, text[], text, numeric, integer, integer)
  to anon, authenticated;

commit;

