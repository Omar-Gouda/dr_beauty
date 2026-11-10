begin;

-- NULL means this historical order predates item-level allocation. New checkout
-- rows store an explicit amount, including zero for ineligible/free items.
alter table public.order_items
  add column promotion_discount_amount numeric(14, 2),
  add constraint order_items_promotion_discount_amount_check
    check (promotion_discount_amount is null or
      (promotion_discount_amount >= 0 and promotion_discount_amount <= unit_price * quantity));

create function private.validate_order_item_discount_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item_count bigint;
  v_unallocated_count bigint;
  v_allocated_total numeric(14, 2);
begin
  select pg_catalog.count(*),
         pg_catalog.count(*) filter (where item.promotion_discount_amount is null),
         coalesce(pg_catalog.sum(item.promotion_discount_amount), 0)
  into v_item_count, v_unallocated_count, v_allocated_total
  from public.order_items as item
  where item.order_id = new.id;

  if v_item_count = 0 or v_unallocated_count <> 0 or v_allocated_total is distinct from new.discount_amount then
    raise exception 'Order item promotion allocations must equal the order discount'
      using errcode = '23514';
  end if;
  return null;
end;
$$;
alter function private.validate_order_item_discount_allocation() owner to postgres;
revoke all on function private.validate_order_item_discount_allocation() from public, anon, authenticated, service_role;

-- Deferred until checkout has inserted every item. Existing orders are untouched.
create constraint trigger orders_item_discount_allocation_valid
  after insert on public.orders
  deferrable initially deferred
  for each row execute function private.validate_order_item_discount_allocation();

-- Extend the installed Phase 2B checkout function's single trusted item insert.
-- The function body, privileges, owner and all other checkout logic are retained.
do $$
declare
  v_definition text;
  v_old text;
  v_new text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.create_cod_order(jsonb,uuid,text,text,text,text,text,text,text)'::pg_catalog.regprocedure
  ) into v_definition;
  if v_definition is null then raise exception 'Phase 2B create_cod_order(uuid, ...) was not found'; end if;
  v_definition := pg_catalog.replace(v_definition, pg_catalog.chr(13), '');

  v_old := $old$
  insert into public.order_items (
    order_id, product_id, product_name_snapshot, product_slug_snapshot, unit_price, quantity
  )
  select v_order_id, p.id, p.name, p.slug, p.price, requested.quantity
  from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
  join public.products as p on p.id = requested.product_id
  order by p.id;$old$;
  v_new := $new$
  insert into public.order_items (
    order_id, product_id, product_name_snapshot, product_slug_snapshot,
    unit_price, quantity, promotion_discount_amount
  )
  with priced_items as (
    select p.id as product_id, p.name as product_name, p.slug as product_slug,
           p.price as unit_price, requested.quantity,
           pg_catalog.round(p.price * requested.quantity * 100) as line_cents,
           case
             when v_promotion_id is null then false
             when v_promotion.application_scope = 'order' then true
             when v_promotion.application_scope in ('products', 'product_and_category') and exists (
               select 1 from public.promotion_product_targets as target
               where target.promotion_id = v_promotion.id and target.product_id = p.id
             ) then true
             when v_promotion.application_scope in ('categories', 'product_and_category') and exists (
               select 1 from public.promotion_category_targets as target
               where target.promotion_id = v_promotion.id and target.category_id = p.category_id
             ) then true
             else false
           end as is_eligible
    from pg_catalog.jsonb_to_recordset(p_items) as requested(product_id uuid, quantity integer)
    join public.products as p on p.id = requested.product_id
  ), eligible_totals as (
    select priced_items.*,
           coalesce(pg_catalog.sum(line_cents) filter (where is_eligible) over (), 0) as eligible_cents
    from priced_items
  ), apportioned as (
    select eligible_totals.*,
           case when is_eligible and eligible_cents > 0
             then pg_catalog.floor((v_discount * 100 * line_cents) / eligible_cents)
             else 0 end as base_discount_cents,
           case when is_eligible and eligible_cents > 0
             then pg_catalog.mod(v_discount * 100 * line_cents, eligible_cents)
             else 0 end as remainder_rank_value
    from eligible_totals
  ), ranked as (
    select apportioned.*,
           pg_catalog.sum(base_discount_cents) over () as base_discount_total_cents,
           pg_catalog.row_number() over (
             order by is_eligible desc, remainder_rank_value desc, product_id
           ) as remainder_rank
    from apportioned
  )
  select v_order_id, product_id, product_name, product_slug, unit_price, quantity,
         (base_discount_cents + case
           when is_eligible and remainder_rank <= pg_catalog.round(v_discount * 100) - base_discount_total_cents
             then 1 else 0 end) / 100
  from ranked
  order by product_id;$new$;

  if pg_catalog.strpos(v_definition, v_old) = 0 then
    raise exception 'Unexpected Phase 2B order item insert; discount allocation patch was not applied';
  end if;
  v_definition := pg_catalog.replace(v_definition, v_old, v_new);
  if pg_catalog.strpos(v_definition, 'promotion_discount_amount') = 0 then
    raise exception 'Order item discount allocation replacement was incomplete';
  end if;
  execute v_definition;
end;
$$;

commit;
