begin;

alter table public.promotions
  add column tiered_discount_enabled boolean not null default false;

create table public.promotion_discount_tiers (
  id uuid primary key default gen_random_uuid(),
  promotion_id uuid not null references public.promotions(id) on delete cascade,
  minimum_subtotal numeric(12, 2) not null check (minimum_subtotal >= 0),
  discount_type text not null check (discount_type in ('percentage', 'fixed_amount')),
  discount_value numeric(12, 2) not null check (discount_value > 0),
  maximum_discount numeric(12, 2) check (maximum_discount is null or maximum_discount > 0),
  created_at timestamptz not null default now(),
  constraint promotion_discount_tiers_percentage_check
    check (discount_type <> 'percentage' or discount_value <= 100),
  constraint promotion_discount_tiers_threshold_unique
    unique (promotion_id, minimum_subtotal)
);

create index promotion_discount_tiers_selection_idx
  on public.promotion_discount_tiers (promotion_id, minimum_subtotal desc);

alter table public.promotion_discount_tiers enable row level security;
revoke all privileges on table public.promotion_discount_tiers from public, anon, authenticated, service_role;
grant select on table public.promotion_discount_tiers to authenticated;
create policy promotion_discount_tiers_admin_read
  on public.promotion_discount_tiers for select to authenticated
  using ((select private.is_admin()));

-- The existing save_admin_promotion RPC remains compatible. This overload calls
-- it inside the same transaction and then atomically replaces a validated tier set.
create function public.save_admin_promotion(
  p_promotion jsonb,
  p_product_ids uuid[],
  p_category_ids uuid[],
  p_tiers jsonb
)
returns setof public.promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_saved public.promotions%rowtype;
  v_tier_count integer;
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_promotion is null or pg_catalog.jsonb_typeof(p_promotion) is distinct from 'object'
     or p_tiers is null or pg_catalog.jsonb_typeof(p_tiers) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Promotion details or tiers are invalid.';
  end if;
  select fields.tiered_discount_enabled into v_enabled
  from pg_catalog.jsonb_to_record(p_promotion) as fields(tiered_discount_enabled boolean);
  if v_enabled is null then
    raise exception using errcode = '22023', message = 'Choose whether this promotion uses discount tiers.';
  end if;
  v_tier_count := pg_catalog.jsonb_array_length(p_tiers);
  if v_tier_count > 25 or (v_enabled and v_tier_count = 0) then
    raise exception using errcode = '22023', message = 'Enabled tiered promotions require 1 to 25 tiers.';
  end if;
  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_tiers) as tier(
      minimum_subtotal numeric, discount_type text, discount_value numeric, maximum_discount numeric
    )
    where tier.minimum_subtotal is null or tier.minimum_subtotal < 0
       or tier.minimum_subtotal <> pg_catalog.round(tier.minimum_subtotal, 2)
       or tier.discount_type is null or tier.discount_type not in ('percentage', 'fixed_amount')
       or tier.discount_value is null or tier.discount_value <= 0
       or tier.discount_value <> pg_catalog.round(tier.discount_value, 2)
       or (tier.discount_type = 'percentage' and tier.discount_value > 100)
       or (tier.maximum_discount is not null and (tier.maximum_discount <= 0
           or tier.maximum_discount <> pg_catalog.round(tier.maximum_discount, 2)))
  ) or exists (
    select tier.minimum_subtotal
    from pg_catalog.jsonb_to_recordset(p_tiers) as tier(minimum_subtotal numeric)
    group by tier.minimum_subtotal having pg_catalog.count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'One or more discount tiers are invalid or use a duplicate subtotal threshold.';
  end if;

  select saved.* into v_saved
  from public.save_admin_promotion(p_promotion, p_product_ids, p_category_ids) as saved;
  update public.promotions as promotion
  set tiered_discount_enabled = v_enabled
  where promotion.id = v_saved.id
  returning promotion.* into v_saved;

  delete from public.promotion_discount_tiers as tier where tier.promotion_id = v_saved.id;
  insert into public.promotion_discount_tiers (
    promotion_id, minimum_subtotal, discount_type, discount_value, maximum_discount
  )
  select v_saved.id, tier.minimum_subtotal, tier.discount_type, tier.discount_value, tier.maximum_discount
  from pg_catalog.jsonb_to_recordset(p_tiers) as tier(
    minimum_subtotal numeric, discount_type text, discount_value numeric, maximum_discount numeric
  );
  return next v_saved;
end;
$$;
alter function public.save_admin_promotion(jsonb, uuid[], uuid[], jsonb) owner to postgres;
revoke all on function public.save_admin_promotion(jsonb, uuid[], uuid[], jsonb) from public, anon, authenticated, service_role;
grant execute on function public.save_admin_promotion(jsonb, uuid[], uuid[], jsonb) to authenticated;

-- Calculate preview values from current database prices and targets. This RPC is
-- advisory; final checkout repeats every calculation while holding its locks.
create function public.get_promotion_tier_quote(p_promotion_id uuid, p_items jsonb)
returns table (
  is_eligible boolean,
  subtotal numeric,
  eligible_subtotal numeric,
  discount_amount numeric,
  selected_tier_minimum numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_promotion public.promotions%rowtype;
  v_tier public.promotion_discount_tiers%rowtype;
  v_subtotal numeric(14,2);
  v_eligible numeric(14,2);
  v_discount numeric(14,2) := 0;
  v_item_count integer;
  v_distinct_count integer;
  v_invalid_count integer;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if p_promotion_id is null or p_items is null or pg_catalog.jsonb_typeof(p_items) is distinct from 'array'
     or pg_catalog.jsonb_array_length(p_items) not between 1 and 50 then
    raise exception using errcode = '22023', message = 'Promotion quote input is invalid.';
  end if;
  select pg_catalog.count(*), pg_catalog.count(distinct requested.product_id),
         pg_catalog.count(*) filter (where requested.product_id is null or requested.quantity is null
           or requested.quantity < 1 or requested.quantity > 999)
  into v_item_count, v_distinct_count, v_invalid_count
  from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer);
  if v_item_count <> v_distinct_count or v_invalid_count > 0 then
    raise exception using errcode = '22023', message = 'Promotion quote items are invalid.';
  end if;
  select pg_catalog.sum(product.price * requested.quantity)
  into v_subtotal
  from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
  join public.products as product on product.id = requested.product_id and product.is_active;
  if v_subtotal is null or (
    select pg_catalog.count(*)
    from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
    join public.products as product on product.id = requested.product_id and product.is_active
  ) <> v_item_count then
    raise exception using errcode = 'P0001', message = 'One or more products are unavailable.';
  end if;
  select promotion.* into v_promotion from public.promotions as promotion
  where promotion.id = p_promotion_id and promotion.is_active
    and (promotion.starts_at is null or promotion.starts_at <= pg_catalog.statement_timestamp())
    and (promotion.ends_at is null or promotion.ends_at > pg_catalog.statement_timestamp());
  if not found then
    return query select false, coalesce(v_subtotal, 0), 0::numeric, 0::numeric, null::numeric;
    return;
  end if;
  if v_promotion.application_scope = 'order' then
    v_eligible := v_subtotal;
  else
    select coalesce(pg_catalog.sum(product.price * requested.quantity), 0)
    into v_eligible
    from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
    join public.products as product on product.id = requested.product_id and product.is_active
    where (v_promotion.application_scope in ('products', 'product_and_category') and exists (
             select 1 from public.promotion_product_targets as target
             where target.promotion_id = v_promotion.id and target.product_id = product.id))
       or (v_promotion.application_scope in ('categories', 'product_and_category') and exists (
             select 1 from public.promotion_category_targets as target
             where target.promotion_id = v_promotion.id and target.category_id = product.category_id));
  end if;
  if v_eligible < v_promotion.minimum_subtotal or (v_promotion.application_scope <> 'order' and v_eligible <= 0) then
    return query select false, v_subtotal, v_eligible, 0::numeric, null::numeric;
    return;
  end if;
  if v_promotion.tiered_discount_enabled then
    select tier.* into v_tier from public.promotion_discount_tiers as tier
    where tier.promotion_id = v_promotion.id and tier.minimum_subtotal <= v_eligible
    order by tier.minimum_subtotal desc limit 1;
    if not found then
      return query select false, v_subtotal, v_eligible, 0::numeric, null::numeric;
      return;
    end if;
    if v_tier.discount_type = 'percentage' then
      v_discount := pg_catalog.round(v_eligible * v_tier.discount_value / 100, 2);
    else
      v_discount := least(v_eligible, v_tier.discount_value);
    end if;
    if v_tier.maximum_discount is not null then v_discount := least(v_discount, v_tier.maximum_discount); end if;
    if v_promotion.maximum_discount is not null then v_discount := least(v_discount, v_promotion.maximum_discount); end if;
  else
    if v_promotion.discount_type = 'percentage' then
      v_discount := pg_catalog.round(v_eligible * v_promotion.discount_value / 100, 2);
    else
      v_discount := least(v_eligible, v_promotion.discount_value);
    end if;
    if v_promotion.maximum_discount is not null then v_discount := least(v_discount, v_promotion.maximum_discount); end if;
  end if;
  v_discount := least(v_discount, v_eligible);
  return query select true, v_subtotal, v_eligible, v_discount, v_tier.minimum_subtotal;
end;
$$;
alter function public.get_promotion_tier_quote(uuid, jsonb) owner to postgres;
revoke all on function public.get_promotion_tier_quote(uuid, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.get_promotion_tier_quote(uuid, jsonb) to authenticated;

-- Patch the Phase 2A RPC from its deployed/local installed definition, preserving
-- its signature, grants, owner and unrelated checkout/idempotency logic.
do $$
declare
  v_definition text;
  v_before text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_cod_order(jsonb,uuid,text,text,text,text,text,text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition is null then raise exception 'Phase 2A create_cod_order(uuid, ...) was not found'; end if;
  v_definition := pg_catalog.replace(v_definition, pg_catalog.chr(13), '');

  v_old := '  v_redemptions bigint;';
  if pg_catalog.strpos(v_definition, v_old) = 0 then raise exception 'Unexpected Phase 2A checkout declarations'; end if;
  v_definition := pg_catalog.replace(v_definition, v_old,
    v_old || E'\n  v_account_redemptions bigint;\n  v_tier public.promotion_discount_tiers%rowtype;');

  v_old := E'where pg_catalog.lower(promotion.code) = pg_catalog.lower(pg_catalog.btrim(p_promotion_code))\n    for share;';
  if pg_catalog.strpos(v_definition, v_old) = 0 then raise exception 'Unexpected promotion lookup lock in checkout'; end if;
  v_definition := pg_catalog.replace(v_definition, v_old,
    E'where pg_catalog.lower(promotion.code) = pg_catalog.lower(pg_catalog.btrim(p_promotion_code))\n    for update;');

  v_old := $old$
    if v_promotion.maximum_redemptions is not null then
      select pg_catalog.count(*) into v_redemptions
      from public.orders as existing_order
      where existing_order.promotion_id = v_promotion.id
        and existing_order.order_status <> 'cancelled';
      if v_redemptions >= v_promotion.maximum_redemptions then
        raise exception using errcode = 'P0001', message = 'The promotion redemption limit has been reached.';
      end if;
    end if;$old$;
  v_new := $new$
    select
      pg_catalog.count(*) filter (where redemption.status in ('reserved', 'redeemed', 'refunded')),
      pg_catalog.count(*) filter (where redemption.account_id = v_user_id
        and redemption.status in ('reserved', 'redeemed', 'refunded'))
    into v_redemptions, v_account_redemptions
    from private.promotion_redemptions as redemption
    where redemption.promotion_id = v_promotion.id;
    if v_promotion.maximum_redemptions is not null and v_redemptions >= v_promotion.maximum_redemptions then
      raise exception using errcode = 'P0001', message = 'The promotion redemption limit has been reached.';
    end if;
    if v_promotion.per_account_redemption_limit is not null
       and v_account_redemptions >= v_promotion.per_account_redemption_limit then
      raise exception using errcode = 'P0001', message = 'You have reached this promotion redemption limit for your account.';
    end if;$new$;
  if pg_catalog.strpos(v_definition, v_old) = 0 then raise exception 'Unexpected promotion capacity block in checkout'; end if;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  v_old := $old$
    if v_promotion.discount_type = 'percentage' then
      v_discount := pg_catalog.round(v_eligible_subtotal * v_promotion.discount_value / 100, 2);
      if v_promotion.maximum_discount is not null then
        v_discount := least(v_discount, v_promotion.maximum_discount);
      end if;
    else
      v_discount := least(v_eligible_subtotal, v_promotion.discount_value);
    end if;
    v_discount := least(v_discount, v_eligible_subtotal);$old$;
  v_new := $new$
    if v_promotion.tiered_discount_enabled then
      select tier.* into v_tier
      from public.promotion_discount_tiers as tier
      where tier.promotion_id = v_promotion.id and tier.minimum_subtotal <= v_eligible_subtotal
      order by tier.minimum_subtotal desc limit 1;
      if not found then
        raise exception using errcode = 'P0001', message = 'The promotion is invalid or not eligible for this order.';
      end if;
      if v_tier.discount_type = 'percentage' then
        v_discount := pg_catalog.round(v_eligible_subtotal * v_tier.discount_value / 100, 2);
      else
        v_discount := least(v_eligible_subtotal, v_tier.discount_value);
      end if;
      if v_tier.maximum_discount is not null then v_discount := least(v_discount, v_tier.maximum_discount); end if;
      if v_promotion.maximum_discount is not null then v_discount := least(v_discount, v_promotion.maximum_discount); end if;
    else
      if v_promotion.discount_type = 'percentage' then
        v_discount := pg_catalog.round(v_eligible_subtotal * v_promotion.discount_value / 100, 2);
        if v_promotion.maximum_discount is not null then v_discount := least(v_discount, v_promotion.maximum_discount); end if;
      else
        v_discount := least(v_eligible_subtotal, v_promotion.discount_value);
      end if;
    end if;
    v_discount := least(v_discount, v_eligible_subtotal);$new$;
  if pg_catalog.strpos(v_definition, v_old) = 0 then raise exception 'Unexpected promotion calculation block in checkout'; end if;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);
  if pg_catalog.strpos(v_definition, 'promotion_discount_tiers') = 0 then
    raise exception 'Tiered checkout replacement did not produce the expected definition';
  end if;
  execute v_definition;
end;
$$;

commit;
