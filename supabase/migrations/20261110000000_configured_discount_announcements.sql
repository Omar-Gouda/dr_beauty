begin;

alter table public.promotions
  add column is_announcement boolean not null default false,
  add column announcement_priority integer not null default 0
    check (announcement_priority between -1000000 and 1000000);

-- Return only opted-in, currently redeemable public discount summaries. The
-- SECURITY DEFINER projection avoids granting public reads to order records
-- merely to determine whether a redemption limit has been exhausted.
create function public.get_public_discount_announcements()
returns table (
  code text,
  discount_type text,
  discount_value numeric,
  minimum_subtotal numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select promotion.code,
         promotion.discount_type,
         promotion.discount_value,
         promotion.minimum_subtotal
  from public.promotions as promotion
  where promotion.is_announcement
    and promotion.is_active
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
  order by promotion.announcement_priority desc, promotion.code asc
  limit 6;
$$;

revoke all on function public.get_public_discount_announcements()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_discount_announcements()
  to anon, authenticated;

commit;
