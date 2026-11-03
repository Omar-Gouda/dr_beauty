begin;

-- Public callers must not read orders to learn whether a promotion is exhausted.
-- Project only featured promotion details that pass the same status, date, and
-- non-cancelled-order redemption rules used by the order-creation RPC.
create function public.get_public_featured_promotions(p_limit integer default 24)
returns table (
  id uuid,
  code text,
  title text,
  description text,
  discount_type text,
  discount_value numeric,
  maximum_discount numeric,
  minimum_subtotal numeric,
  starts_at timestamptz,
  ends_at timestamptz,
  target_path text,
  maximum_redemptions integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select promotion.id,
         promotion.code,
         promotion.title,
         promotion.description,
         promotion.discount_type,
         promotion.discount_value,
         promotion.maximum_discount,
         promotion.minimum_subtotal,
         promotion.starts_at,
         promotion.ends_at,
         promotion.target_path,
         promotion.maximum_redemptions
  from public.promotions as promotion
  where promotion.is_featured
    and promotion.is_active
    and nullif(pg_catalog.btrim(promotion.code), '') is not null
    and nullif(pg_catalog.btrim(promotion.title), '') is not null
    and (promotion.starts_at is null or promotion.starts_at <= pg_catalog.statement_timestamp())
    and (promotion.ends_at is null or promotion.ends_at > pg_catalog.statement_timestamp())
    and (
      promotion.maximum_redemptions is null
      or (
        select pg_catalog.count(*)
        from public.orders as existing_order
        where existing_order.promotion_id = promotion.id
          and existing_order.order_status <> 'cancelled'
      ) < promotion.maximum_redemptions
    )
  order by promotion.display_priority desc, promotion.code asc
  limit LEAST(GREATEST(COALESCE(p_limit, 24), 1), 24);
$$;

revoke all on function public.get_public_featured_promotions(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_featured_promotions(integer)
  to anon, authenticated;

commit;
