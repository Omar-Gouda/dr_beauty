begin;

-- Public ranking order remains based on the private qualifying metrics, but
-- the public RPC returns only names. Position is represented by array order.
create or replace function public.get_public_storefront_customer_rankings()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_show_loved boolean := false;
  v_show_elites boolean := false;
  v_result jsonb;
begin
  select settings.show_loved_by_dr_beauty, settings.show_dr_beauty_elites
    into v_show_loved, v_show_elites
  from public.storefront_ranking_settings as settings
  where settings.singleton is true;

  select pg_catalog.jsonb_build_object(
    'loved_by_dr_beauty', case when v_show_loved then coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'display_name', case when coalesce(profile.show_public_ranking, true)
          then coalesce(nullif(pg_catalog.btrim(profile.full_name), ''), 'Beauty customer')
          else 'Private member' end
      ) order by buyer.qualifying_orders desc, buyer.account_id)
      from (
        select analytics.account_id, pg_catalog.count(*) as qualifying_orders
        from private.customer_purchase_analytics as analytics
        where analytics.is_delivered
          and not exists (
            select 1 from public.user_roles as role
            where role.user_id = analytics.account_id
          )
        group by analytics.account_id
        order by qualifying_orders desc, analytics.account_id
        limit 5
      ) as buyer
      left join public.profiles as profile on profile.id = buyer.account_id
    ), '[]'::jsonb) else '[]'::jsonb end,
    'dr_beauty_elites', case when v_show_elites then coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'display_name', case when coalesce(profile.show_public_ranking, true)
          then coalesce(nullif(pg_catalog.btrim(profile.full_name), ''), 'Beauty customer')
          else 'Private member' end
      ) order by elite.purchase_value desc, elite.account_id)
      from (
        select analytics.account_id,
               pg_catalog.sum(analytics.order_total_snapshot)::numeric(14, 2) as purchase_value
        from private.customer_purchase_analytics as analytics
        where analytics.is_paid_and_delivered
          and not exists (
            select 1 from public.user_roles as role
            where role.user_id = analytics.account_id
          )
        group by analytics.account_id
        having pg_catalog.sum(analytics.order_total_snapshot) > 0
        order by purchase_value desc, analytics.account_id
        limit 3
      ) as elite
      left join public.profiles as profile on profile.id = elite.account_id
    ), '[]'::jsonb) else '[]'::jsonb end
  ) into v_result;

  return v_result;
end;
$$;
alter function public.get_public_storefront_customer_rankings() owner to postgres;
revoke all on function public.get_public_storefront_customer_rankings()
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_storefront_customer_rankings()
  to anon, authenticated;

commit;
