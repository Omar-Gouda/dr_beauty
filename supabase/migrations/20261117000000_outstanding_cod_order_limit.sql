begin;

-- The database owner can adjust this private setting without exposing it to
-- storefront clients or adding a public configuration endpoint.
create table private.cod_order_limit_settings (
  singleton boolean primary key default true check (singleton is true),
  max_outstanding_cod_orders integer not null default 3
    check (max_outstanding_cod_orders >= 1)
);

insert into private.cod_order_limit_settings (singleton, max_outstanding_cod_orders)
values (true, 3);

alter table private.cod_order_limit_settings enable row level security;
revoke all on table private.cod_order_limit_settings
  from public, anon, authenticated, service_role;

create function private.enforce_outstanding_cod_order_limit()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_outstanding_count bigint;
begin
  if new.user_id is null
     or new.payment_method <> 'cod'
     or new.order_status not in ('pending_confirmation', 'confirmed', 'processing', 'shipped') then
    return new;
  end if;

  -- Serialize distinct order attempts for this customer until their
  -- transaction commits. The volatile trigger's subsequent count query gets
  -- a fresh READ COMMITTED snapshot after any lock wait.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('outstanding-cod-orders:' || new.user_id::text, 0)
  );

  select settings.max_outstanding_cod_orders
    into v_limit
  from private.cod_order_limit_settings as settings
  where settings.singleton is true;

  if not found or v_limit is null or v_limit < 1 then
    raise exception using
      errcode = 'PZ002',
      message = 'COD order limit configuration is unavailable.';
  end if;

  select pg_catalog.count(*)
    into v_outstanding_count
  from public.orders as existing_order
  where existing_order.user_id = new.user_id
    and existing_order.payment_method = 'cod'
    and existing_order.order_status in ('pending_confirmation', 'confirmed', 'processing', 'shipped');

  if v_outstanding_count >= v_limit then
    raise exception using
      errcode = 'PZ001',
      message = 'Outstanding COD order limit reached.';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_outstanding_cod_order_limit()
  from public, anon, authenticated, service_role;

create trigger orders_enforce_outstanding_cod_order_limit
  before insert on public.orders
  for each row execute function private.enforce_outstanding_cod_order_limit();

commit;
