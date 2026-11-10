begin;

-- Both public ranking sections start hidden. The exposed table columns contain
-- only these two display switches; analytics and account identifiers remain
-- inside the private schema.
create table public.storefront_ranking_settings (
  singleton boolean primary key default true check (singleton),
  show_loved_by_dr_beauty boolean not null default false,
  show_dr_beauty_elites boolean not null default false,
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);

insert into public.storefront_ranking_settings (singleton)
values (true);

alter table public.storefront_ranking_settings enable row level security;
revoke all privileges on table public.storefront_ranking_settings
  from public, anon, authenticated, service_role;
grant select (show_loved_by_dr_beauty, show_dr_beauty_elites)
  on table public.storefront_ranking_settings to anon, authenticated;

create policy storefront_ranking_settings_public_read
  on public.storefront_ranking_settings for select to anon, authenticated
  using (true);

create function public.get_public_storefront_customer_rankings()
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
          else 'Private member' end,
        'qualifying_orders', buyer.qualifying_orders
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
          else 'Private member' end,
        'purchase_value', elite.purchase_value
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

create function public.update_admin_storefront_ranking_visibility(
  p_show_loved_by_dr_beauty boolean,
  p_show_dr_beauty_elites boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated public.storefront_ranking_settings%rowtype;
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_show_loved_by_dr_beauty is null or p_show_dr_beauty_elites is null then
    raise exception using errcode = '22023', message = 'Both ranking visibility choices are required.';
  end if;

  update public.storefront_ranking_settings as settings
  set show_loved_by_dr_beauty = p_show_loved_by_dr_beauty,
      show_dr_beauty_elites = p_show_dr_beauty_elites,
      updated_at = pg_catalog.clock_timestamp()
  where settings.singleton is true
  returning settings.* into v_updated;

  if not found then
    raise exception using errcode = 'P0002', message = 'Ranking visibility settings are unavailable.';
  end if;

  return pg_catalog.jsonb_build_object(
    'show_loved_by_dr_beauty', v_updated.show_loved_by_dr_beauty,
    'show_dr_beauty_elites', v_updated.show_dr_beauty_elites,
    'updated_at', v_updated.updated_at
  );
end;
$$;
alter function public.update_admin_storefront_ranking_visibility(boolean, boolean) owner to postgres;
revoke all on function public.update_admin_storefront_ranking_visibility(boolean, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.update_admin_storefront_ranking_visibility(boolean, boolean)
  to authenticated;

commit;
