begin;

-- Customers may opt out of name display in customer rankings. This field is
-- private to the account and defaults to the agreed enabled setting.
alter table public.profiles
  add column show_public_ranking boolean not null default true;
comment on column public.profiles.show_public_ranking is
  'Whether the account holder permits their profile name to appear in customer rankings.';
grant update (show_public_ranking) on public.profiles to authenticated;

-- Retention-safe, PII-light order evidence. No FK to orders: the row survives
-- the 45-day order deletion policy. Auth account deletion removes its record.
create table private.customer_purchase_analytics (
  order_id uuid primary key,
  account_id uuid not null references auth.users(id) on delete cascade,
  order_number_snapshot bigint not null,
  order_total_snapshot numeric(14, 2) not null check (order_total_snapshot >= 0),
  is_delivered boolean not null,
  is_paid_and_delivered boolean not null,
  last_recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  check (not is_paid_and_delivered or is_delivered)
);
create index customer_purchase_analytics_buyers_idx
  on private.customer_purchase_analytics (is_delivered, account_id);
create index customer_purchase_analytics_elites_idx
  on private.customer_purchase_analytics (is_paid_and_delivered, account_id);
alter table private.customer_purchase_analytics enable row level security;
revoke all privileges on table private.customer_purchase_analytics from public, anon, authenticated, service_role;

create function private.sync_customer_purchase_analytics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.user_id is not null and new.order_status = 'delivered' then
    insert into private.customer_purchase_analytics (
      order_id, account_id, order_number_snapshot, order_total_snapshot,
      is_delivered, is_paid_and_delivered, last_recorded_at
    ) values (
      new.id, new.user_id, new.order_number, new.total_amount,
      true, new.payment_status = 'paid', pg_catalog.clock_timestamp()
    )
    on conflict (order_id) do update set
      account_id = excluded.account_id,
      order_number_snapshot = excluded.order_number_snapshot,
      order_total_snapshot = excluded.order_total_snapshot,
      is_delivered = excluded.is_delivered,
      is_paid_and_delivered = excluded.is_paid_and_delivered,
      last_recorded_at = excluded.last_recorded_at;
  elsif tg_op = 'UPDATE' and exists (
    select 1 from private.customer_purchase_analytics as prior
    where prior.order_id = new.id
  ) then
    update private.customer_purchase_analytics
    set account_id = new.user_id,
        order_number_snapshot = new.order_number,
        order_total_snapshot = new.total_amount,
        is_delivered = false,
        is_paid_and_delivered = false,
        last_recorded_at = pg_catalog.clock_timestamp()
    where order_id = new.id
      and new.user_id is not null;
  end if;
  return new;
end;
$$;
alter function private.sync_customer_purchase_analytics() owner to postgres;
revoke all on function private.sync_customer_purchase_analytics() from public, anon, authenticated, service_role;

create trigger orders_sync_customer_purchase_analytics
after insert or update of user_id, order_status, payment_status, subtotal, shipping_amount, discount_amount
on public.orders
for each row execute function private.sync_customer_purchase_analytics();

-- Backfill all delivered orders still present at rollout. Earlier orders
-- removed by retention cannot be reconstructed from the remaining schema.
insert into private.customer_purchase_analytics (
  order_id, account_id, order_number_snapshot, order_total_snapshot,
  is_delivered, is_paid_and_delivered, last_recorded_at
)
select order_row.id, order_row.user_id, order_row.order_number,
       order_row.total_amount, true, order_row.payment_status = 'paid',
       pg_catalog.clock_timestamp()
from public.orders as order_row
where order_row.user_id is not null
  and order_row.order_status = 'delivered'
on conflict (order_id) do nothing;

-- Anonymous first-party browser identifiers are stored only as HMAC hashes.
-- The cookie secret and raw visitor ID remain in the application server.
create table private.admin_daily_visitors (
  visit_date date not null,
  visitor_hash text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (visit_date, visitor_hash)
);
create table private.admin_monthly_visitor_snapshots (
  month_start date primary key,
  unique_visitors bigint not null check (unique_visitors >= 0),
  captured_at timestamptz not null default pg_catalog.clock_timestamp()
);
create table private.admin_visitor_tracking_config (
  singleton boolean primary key default true check (singleton),
  started_month date not null
);
insert into private.admin_visitor_tracking_config (singleton, started_month)
values (true, pg_catalog.date_trunc(
  'month', pg_catalog.clock_timestamp() at time zone 'Africa/Cairo'
)::date);
alter table private.admin_daily_visitors enable row level security;
alter table private.admin_monthly_visitor_snapshots enable row level security;
alter table private.admin_visitor_tracking_config enable row level security;
revoke all privileges on table private.admin_daily_visitors,
  private.admin_monthly_visitor_snapshots, private.admin_visitor_tracking_config
  from public, anon, authenticated, service_role;

create function public.record_admin_visitor(p_visitor_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid visitor identifier' using errcode = '22023';
  end if;
  insert into private.admin_daily_visitors (visit_date, visitor_hash)
  values (
    (pg_catalog.clock_timestamp() at time zone 'Africa/Cairo')::date,
    p_visitor_hash
  )
  on conflict (visit_date, visitor_hash) do nothing;
end;
$$;
alter function public.record_admin_visitor(text) owner to postgres;
revoke all on function public.record_admin_visitor(text) from public, anon, authenticated, service_role;
grant execute on function public.record_admin_visitor(text) to service_role;

-- Catch up all missing closed months before trimming old daily pseudonymous
-- identifiers. Snapshot rows are immutable and conflict-safe.
create function private.snapshot_closed_admin_visitor_months()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_month date := pg_catalog.date_trunc(
    'month', pg_catalog.clock_timestamp() at time zone 'Africa/Cairo'
  )::date;
  v_month date;
  v_next_month date;
  v_inserted bigint := 0;
  v_rows bigint;
begin
  select config.started_month into v_month
  from private.admin_visitor_tracking_config as config
  where config.singleton;

  while v_month < v_current_month loop
    v_next_month := (v_month + interval '1 month')::date;
    insert into private.admin_monthly_visitor_snapshots (month_start, unique_visitors)
    select v_month, pg_catalog.count(distinct visitor.visitor_hash)
    from private.admin_daily_visitors as visitor
    where visitor.visit_date >= v_month and visitor.visit_date < v_next_month
    on conflict (month_start) do nothing;
    get diagnostics v_rows = row_count;
    v_inserted := v_inserted + v_rows;
    v_month := v_next_month;
  end loop;

  delete from private.admin_daily_visitors
  where visit_date < v_current_month
    and exists (
      select 1 from private.admin_monthly_visitor_snapshots as snapshot
      where snapshot.month_start = pg_catalog.date_trunc('month', admin_daily_visitors.visit_date)::date
    );
  return v_inserted;
end;
$$;
alter function private.snapshot_closed_admin_visitor_months() owner to postgres;
revoke all on function private.snapshot_closed_admin_visitor_months() from public, anon, authenticated, service_role;
grant execute on function private.snapshot_closed_admin_visitor_months() to postgres;

create function public.get_admin_user_dashboard_metrics()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_cairo_today date := (pg_catalog.clock_timestamp() at time zone 'Africa/Cairo')::date;
  v_cairo_month date := pg_catalog.date_trunc(
    'month', pg_catalog.clock_timestamp() at time zone 'Africa/Cairo'
  )::date;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;

  select pg_catalog.jsonb_build_object(
    'total_users', (
      select pg_catalog.count(*) from auth.users as account
      where not exists (select 1 from public.user_roles as role where role.user_id = account.id)
    ),
    'new_users_7d', (
      select pg_catalog.count(*) from auth.users as account
      where account.created_at >= pg_catalog.clock_timestamp() - interval '7 days'
        and not exists (select 1 from public.user_roles as role where role.user_id = account.id)
    ),
    'visitors_today', (
      select pg_catalog.count(*) from private.admin_daily_visitors as visitor
      where visitor.visit_date = v_cairo_today
    ),
    'visitors_mtd', (
      select pg_catalog.count(distinct visitor.visitor_hash) from private.admin_daily_visitors as visitor
      where visitor.visit_date >= v_cairo_month and visitor.visit_date <= v_cairo_today
    ),
    'top_buyers', coalesce((
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
          and not exists (select 1 from public.user_roles as role where role.user_id = analytics.account_id)
        group by analytics.account_id
        order by qualifying_orders desc, analytics.account_id
        limit 5
      ) as buyer
      left join public.profiles as profile on profile.id = buyer.account_id
    ), '[]'::jsonb),
    'elites', coalesce((
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
          and not exists (select 1 from public.user_roles as role where role.user_id = analytics.account_id)
        group by analytics.account_id
        having pg_catalog.sum(analytics.order_total_snapshot) > 0
        order by purchase_value desc, analytics.account_id
        limit 3
      ) as elite
      left join public.profiles as profile on profile.id = elite.account_id
    ), '[]'::jsonb),
    'monthly_visitor_history', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'month_start', history.month_start,
        'unique_visitors', history.unique_visitors
      ) order by history.month_start desc)
      from (
        select snapshot.month_start, snapshot.unique_visitors
        from private.admin_monthly_visitor_snapshots as snapshot
        order by snapshot.month_start desc
        limit 24
      ) as history
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
alter function public.get_admin_user_dashboard_metrics() owner to postgres;
revoke all on function public.get_admin_user_dashboard_metrics() from public, anon, authenticated, service_role;
grant execute on function public.get_admin_user_dashboard_metrics() to authenticated;

do $$
declare
  v_job_id bigint;
begin
  if not exists (
    select 1 from pg_catalog.pg_extension as extension_row where extension_row.extname = 'pg_cron'
  ) or not exists (
    select 1 from pg_catalog.pg_namespace as schema_row where schema_row.nspname = 'cron'
  ) then
    raise exception 'Enable Supabase pg_cron before applying the admin visitor analytics migration.';
  end if;

  for v_job_id in
    select job.jobid from cron.job as job
    where job.jobname = 'dr-beauty-admin-visitor-month-snapshots'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'dr-beauty-admin-visitor-month-snapshots',
    '20 3 * * *',
    'select private.snapshot_closed_admin_visitor_months();'
  );
end;
$$;

commit;
