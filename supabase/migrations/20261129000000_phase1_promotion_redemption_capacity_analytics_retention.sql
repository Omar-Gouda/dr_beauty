begin;

-- A deleted order may still have a reserved promotion row. Keep the row and
-- its financial/account snapshots, but record that its reservation was
-- released so it no longer occupies redemption capacity.
alter table private.promotion_redemptions
  drop constraint promotion_redemptions_status_check,
  add column released_at timestamptz;

alter table private.promotion_redemptions
  add constraint promotion_redemptions_status_check
    check (status in ('reserved', 'redeemed', 'cancelled', 'refunded', 'released')),
  add constraint promotion_redemptions_released_at_check
    check ((status = 'released') = (released_at is not null));

-- Existing NULL order references come from ON DELETE SET NULL. Release their
-- reservations now; transaction time is the earliest reliable cleanup time.
update private.promotion_redemptions as redemption
set status = 'released',
    released_at = pg_catalog.transaction_timestamp()
where redemption.order_id is null
  and redemption.status = 'reserved';

create function private.release_reserved_promotion_redemption_on_order_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.promotion_redemptions as redemption
  set status = 'released',
      released_at = pg_catalog.clock_timestamp()
  where redemption.order_id = old.id
    and redemption.status = 'reserved';
  return old;
end;
$$;

revoke all on function private.release_reserved_promotion_redemption_on_order_delete()
  from public, anon, authenticated, service_role;

create trigger orders_release_reserved_promotion_redemption
  before delete on public.orders
  for each row execute function private.release_reserved_promotion_redemption_on_order_delete();

-- Checkout preview is advisory. It returns only capacity booleans for the
-- authenticated caller; final order insertion rechecks capacity under locks.
create function public.check_promotion_redemption_capacity(p_promotion_id uuid)
returns table (global_capacity_available boolean, account_capacity_available boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := auth.uid();
  v_global_limit integer;
  v_account_limit integer;
  v_global_usage bigint;
  v_account_usage bigint;
  v_is_active boolean;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
begin
  if v_account_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required to check promotion eligibility.';
  end if;
  if p_promotion_id is null then
    raise exception using errcode = '22023', message = 'A promotion identifier is required.';
  end if;

  select promotion.maximum_redemptions, promotion.per_account_redemption_limit,
         promotion.is_active, promotion.starts_at, promotion.ends_at
    into v_global_limit, v_account_limit, v_is_active, v_starts_at, v_ends_at
  from public.promotions as promotion
  where promotion.id = p_promotion_id
  for share;

  if not found or not v_is_active
     or (v_starts_at is not null and v_starts_at > pg_catalog.statement_timestamp())
     or (v_ends_at is not null and v_ends_at <= pg_catalog.statement_timestamp()) then
    return query select false, false;
    return;
  end if;

  select
    pg_catalog.count(*) filter (
      where redemption.status in ('reserved', 'redeemed', 'refunded')
    ),
    pg_catalog.count(*) filter (
      where redemption.account_id = v_account_id
        and redemption.status in ('reserved', 'redeemed', 'refunded')
    )
  into v_global_usage, v_account_usage
  from private.promotion_redemptions as redemption
  where redemption.promotion_id = p_promotion_id;

  return query select
    v_global_limit is null or v_global_usage < v_global_limit,
    v_account_limit is null or v_account_usage < v_account_limit;
end;
$$;

revoke all on function public.check_promotion_redemption_capacity(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.check_promotion_redemption_capacity(uuid)
  to authenticated;

-- Admin-only redemption reporting. Counts include every preserved ledger row;
-- capacity_count includes only states that the checkout guard counts as usage.
create function public.get_admin_promotion_redemption_counts()
returns table (
  promotion_id uuid,
  total_records bigint,
  capacity_count bigint,
  reserved_count bigint,
  redeemed_count bigint,
  cancelled_count bigint,
  refunded_count bigint,
  released_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  return query
  select promotion.id,
         pg_catalog.count(redemption.id),
         pg_catalog.count(redemption.id) filter (
           where redemption.status in ('reserved', 'redeemed', 'refunded')
         ),
         pg_catalog.count(redemption.id) filter (where redemption.status = 'reserved'),
         pg_catalog.count(redemption.id) filter (where redemption.status = 'redeemed'),
         pg_catalog.count(redemption.id) filter (where redemption.status = 'cancelled'),
         pg_catalog.count(redemption.id) filter (where redemption.status = 'refunded'),
         pg_catalog.count(redemption.id) filter (where redemption.status = 'released')
  from public.promotions as promotion
  left join private.promotion_redemptions as redemption
    on redemption.promotion_id = promotion.id
  group by promotion.id;
end;
$$;

revoke all on function public.get_admin_promotion_redemption_counts()
  from public, anon, authenticated, service_role;
grant execute on function public.get_admin_promotion_redemption_counts()
  to authenticated;

commit;
