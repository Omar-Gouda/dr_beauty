begin;

-- Dashboard date-window aggregates use the same durable order and redemption
-- snapshots as the rest of the admin analytics. A partial redemption index
-- makes Cairo day/month usage lookups independent of promotion IDs.
create index orders_dashboard_created_at_idx
  on public.orders (created_at);
create index promotion_redemptions_dashboard_qualified_at_idx
  on private.promotion_redemptions (qualified_at)
  where status = 'redeemed';

create function public.get_admin_cairo_revenue_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_today_start timestamptz;
  v_month_start timestamptz;
  v_total_orders bigint;
  v_today_orders bigint;
  v_mtd_orders bigint;
  v_today_delivered_value numeric(14, 2);
  v_mtd_delivered_value numeric(14, 2);
  v_today_collected_revenue numeric(14, 2);
  v_mtd_collected_revenue numeric(14, 2);
  v_today_discount_uses bigint;
  v_mtd_discount_uses bigint;
  v_today_discount_amount numeric(14, 2);
  v_mtd_discount_amount numeric(14, 2);
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  v_today_start := pg_catalog.date_trunc('day', v_now at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
  v_month_start := pg_catalog.date_trunc('month', v_now at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';

  select pg_catalog.count(*)
    into v_total_orders
  from public.orders as order_row
  where order_row.order_status <> 'cancelled';

  select
    pg_catalog.count(*) filter (
      where order_row.created_at >= v_today_start
        and order_row.order_status <> 'cancelled'
    ),
    pg_catalog.count(*) filter (where order_row.order_status <> 'cancelled'),
    coalesce(pg_catalog.sum(order_row.total_amount) filter (
      where order_row.created_at >= v_today_start
        and order_row.order_status = 'delivered'
        and order_row.payment_status <> 'refunded'
    ), 0)::numeric(14, 2),
    coalesce(pg_catalog.sum(order_row.total_amount) filter (
      where order_row.order_status = 'delivered'
        and order_row.payment_status <> 'refunded'
    ), 0)::numeric(14, 2),
    coalesce(pg_catalog.sum(order_row.total_amount) filter (
      where order_row.created_at >= v_today_start
        and order_row.order_status = 'delivered'
        and order_row.payment_status = 'paid'
    ), 0)::numeric(14, 2),
    coalesce(pg_catalog.sum(order_row.total_amount) filter (
      where order_row.order_status = 'delivered'
        and order_row.payment_status = 'paid'
    ), 0)::numeric(14, 2)
  into v_today_orders, v_mtd_orders,
       v_today_delivered_value, v_mtd_delivered_value,
       v_today_collected_revenue, v_mtd_collected_revenue
  from public.orders as order_row
  where order_row.created_at >= v_month_start
    and order_row.created_at < v_now;

  select
    pg_catalog.count(*) filter (where redemption.qualified_at >= v_today_start),
    pg_catalog.count(*),
    coalesce(pg_catalog.sum(redemption.discount_amount) filter (
      where redemption.qualified_at >= v_today_start
    ), 0)::numeric(14, 2),
    coalesce(pg_catalog.sum(redemption.discount_amount), 0)::numeric(14, 2)
  into v_today_discount_uses, v_mtd_discount_uses,
       v_today_discount_amount, v_mtd_discount_amount
  from private.promotion_redemptions as redemption
  where redemption.status = 'redeemed'
    and redemption.qualified_at >= v_month_start
    and redemption.qualified_at < v_now;

  return pg_catalog.jsonb_build_object(
    'total_orders', v_total_orders,
    'today_orders', v_today_orders,
    'mtd_orders', v_mtd_orders,
    'today_delivered_value', v_today_delivered_value,
    'mtd_delivered_value', v_mtd_delivered_value,
    'today_collected_revenue', v_today_collected_revenue,
    'mtd_collected_revenue', v_mtd_collected_revenue,
    'today_discount_uses', v_today_discount_uses,
    'mtd_discount_uses', v_mtd_discount_uses,
    'today_discount_amount', v_today_discount_amount,
    'mtd_discount_amount', v_mtd_discount_amount
  );
end;
$$;
alter function public.get_admin_cairo_revenue_metrics() owner to postgres;
revoke all on function public.get_admin_cairo_revenue_metrics() from public, anon, authenticated, service_role;
grant execute on function public.get_admin_cairo_revenue_metrics() to authenticated;

commit;
