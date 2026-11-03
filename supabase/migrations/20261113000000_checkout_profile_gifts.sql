begin;

alter table public.shipping_settings
  add column gift_packaging_fee numeric(12, 2)
    check (gift_packaging_fee is null or gift_packaging_fee > 0);

alter table public.orders
  add column additional_phone text check (additional_phone is null or pg_catalog.length(additional_phone) between 8 and 40),
  add column is_gift boolean not null default false,
  add column gift_recipient_name text,
  add column gift_recipient_phone text,
  add column gift_message text,
  add column gift_packaging_fee_amount numeric(12, 2) not null default 0 check (gift_packaging_fee_amount >= 0),
  add column gift_packaging_selected boolean not null default false,
  add constraint orders_gift_details_check check (
    (not is_gift and gift_recipient_name is null and gift_recipient_phone is null and gift_message is null
      and not gift_packaging_selected and gift_packaging_fee_amount = 0)
    or (is_gift and gift_recipient_name is not null and pg_catalog.length(gift_recipient_name) between 1 and 160
      and gift_recipient_phone is not null and pg_catalog.length(gift_recipient_phone) between 8 and 40
      and (gift_message is null or pg_catalog.length(gift_message) <= 500)
      and ((gift_packaging_selected and gift_packaging_fee_amount > 0)
        or (not gift_packaging_selected and gift_packaging_fee_amount = 0)))
  );

-- Convert the generated total to a server-maintained snapshot so the gift fee
-- is included. Existing values are preserved (the new fee defaults to zero).
alter table public.orders alter column total_amount drop expression;
-- The previous generated expression could never produce NULL because all of
-- its inputs are NOT NULL. Preserve that guarantee after removing generation.
alter table public.orders alter column total_amount set not null;
alter table public.orders add constraint orders_total_matches_breakdown_check
  check (
    total_amount is not null
    and total_amount = subtotal + shipping_amount + gift_packaging_fee_amount - discount_amount
  );

-- Every order creation RPC ultimately inserts into public.orders through this
-- trigger. Keep the old base RPCs compatible after total_amount stops being
-- generated, and include the default zero gift fee for their initial snapshot.
create function private.set_order_total_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.total_amount := new.subtotal + new.shipping_amount
    + new.gift_packaging_fee_amount - new.discount_amount;
  return new;
end;
$$;

revoke all on function private.set_order_total_amount() from public, anon, authenticated, service_role;

create trigger orders_set_total_amount_before_insert
  before insert on public.orders
  for each row execute function private.set_order_total_amount();

alter table private.cod_order_idempotency add column gift_payload jsonb
  check (gift_payload is null or pg_catalog.jsonb_typeof(gift_payload) = 'object');

-- The old purchase snapshot remains immutable. The gift-detail RPC may fill
-- its dedicated snapshot columns once while it completes the same transaction.
create or replace function private.prevent_order_snapshot_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.user_id, new.promotion_id, new.promotion_code_snapshot,
    new.customer_name, new.customer_email, new.customer_phone,
    new.governorate, new.city, new.address_line, new.delivery_notes,
    new.payment_method, new.subtotal, new.shipping_amount,
    new.discount_amount, new.currency, new.created_at
  ) is distinct from row(
    old.user_id, old.promotion_id, old.promotion_code_snapshot,
    old.customer_name, old.customer_email, old.customer_phone,
    old.governorate, old.city, old.address_line, old.delivery_notes,
    old.payment_method, old.subtotal, old.shipping_amount,
    old.discount_amount, old.currency, old.created_at
  ) then
    raise exception 'Order purchase snapshots are immutable' using errcode = '23514';
  end if;

  if new.total_amount is distinct from old.total_amount
     and pg_catalog.current_setting('drbeauty.gift_order_id', true) is distinct from old.id::text then
    raise exception 'Order totals are immutable' using errcode = '23514';
  end if;

  if row(new.additional_phone, new.is_gift, new.gift_recipient_name, new.gift_recipient_phone,
         new.gift_message, new.gift_packaging_selected, new.gift_packaging_fee_amount)
     is distinct from
     row(old.additional_phone, old.is_gift, old.gift_recipient_name, old.gift_recipient_phone,
         old.gift_message, old.gift_packaging_selected, old.gift_packaging_fee_amount)
     and pg_catalog.current_setting('drbeauty.gift_order_id', true) is distinct from old.id::text then
    raise exception 'Order gift snapshots are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.create_cod_order_with_whatsapp_consent(
  p_items jsonb,
  p_idempotency_key uuid,
  p_customer_name text,
  p_customer_phone text,
  p_governorate text,
  p_city text,
  p_address_line text,
  p_whatsapp_consent boolean,
  p_delivery_notes text,
  p_promotion_code text,
  p_address_id uuid,
  p_additional_phone text,
  p_is_gift boolean,
  p_gift_recipient_name text,
  p_gift_recipient_phone text,
  p_gift_message text,
  p_gift_packaging_selected boolean,
  p_save_new_address boolean
)
returns table (order_number bigint, order_status text, total_amount numeric, currency text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_governorate text := p_governorate;
  v_city text := p_city;
  v_address_line text := p_address_line;
  v_delivery_notes text := p_delivery_notes;
  v_order_id uuid;
  v_saved_name text;
  v_saved_phone text;
  v_fee numeric(12, 2) := 0;
  v_order_number bigint;
  v_order_status text;
  v_total numeric(14, 2);
  v_currency text;
  v_payload jsonb;
  v_existing_payload jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if p_whatsapp_consent is null or p_is_gift is null or p_gift_packaging_selected is null or p_save_new_address is null then
    raise exception using errcode = '22023', message = 'Checkout choices must be specified.';
  end if;
  if p_address_id is not null then
    if p_save_new_address then
      raise exception using errcode = '22023', message = 'Only a new checkout address can be saved to the address book.';
    end if;
    select a.governorate, a.city, a.address_line, a.delivery_notes, a.recipient_name, a.phone
      into v_governorate, v_city, v_address_line, v_delivery_notes, v_saved_name, v_saved_phone
    from public.customer_addresses as a
    where a.id = p_address_id and a.user_id = v_user_id;
    if not found then
      raise exception using errcode = '22023', message = 'The selected delivery address is unavailable.';
    end if;
    if p_is_gift and coalesce(pg_catalog.btrim(p_gift_recipient_name), '') = '' then
      p_gift_recipient_name := v_saved_name;
    end if;
    if p_is_gift and coalesce(pg_catalog.btrim(p_gift_recipient_phone), '') = '' then
      p_gift_recipient_phone := v_saved_phone;
    end if;
  end if;
  if p_additional_phone is not null and pg_catalog.length(pg_catalog.btrim(p_additional_phone)) not between 8 and 40 then
    raise exception using errcode = '22023', message = 'The additional phone number is invalid.';
  end if;
  if p_is_gift then
    if p_gift_recipient_name is null or pg_catalog.length(pg_catalog.btrim(p_gift_recipient_name)) not between 1 and 160
       or p_gift_recipient_phone is null or pg_catalog.length(pg_catalog.btrim(p_gift_recipient_phone)) not between 8 and 40
       or (p_gift_message is not null and pg_catalog.length(pg_catalog.btrim(p_gift_message)) > 500) then
      raise exception using errcode = '22023', message = 'Gift recipient details are invalid.';
    end if;
  elsif p_gift_recipient_name is not null or p_gift_recipient_phone is not null or p_gift_message is not null or p_gift_packaging_selected then
    raise exception using errcode = '22023', message = 'Gift details require gift-order mode.';
  end if;
  perform 1 from public.create_cod_order_with_whatsapp_consent(
    p_items, p_idempotency_key, p_customer_name, p_customer_phone,
    v_governorate, v_city, v_address_line, p_whatsapp_consent,
    v_delivery_notes, p_promotion_code
  );

  select b.order_id, b.gift_payload into v_order_id, v_existing_payload
  from private.cod_order_idempotency as b
  where b.user_id = v_user_id and b.idempotency_key = p_idempotency_key
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'The saved checkout confirmation is unavailable.';
  end if;

  -- A retry must use the fee already bound to this checkout attempt, even if
  -- the owner changed or cleared the current fee after the first commit.
  if v_existing_payload is not null then
    v_fee := coalesce((v_existing_payload ->> 'gift_packaging_fee')::numeric, 0);
    if (p_gift_packaging_selected and v_fee <= 0)
       or (not p_gift_packaging_selected and v_fee <> 0) then
      raise exception using errcode = '22023', message = 'The saved checkout packaging details are invalid.';
    end if;
  elsif p_gift_packaging_selected then
    select s.gift_packaging_fee into v_fee
    from public.shipping_settings as s where s.id is true;
    if v_fee is null or v_fee <= 0 then
      raise exception using errcode = '22023', message = 'Gift packaging is not currently configured.';
    end if;
  end if;

  v_payload := pg_catalog.jsonb_build_object(
    'address_id', p_address_id,
    'additional_phone', nullif(pg_catalog.btrim(p_additional_phone), ''),
    'is_gift', p_is_gift,
    'gift_recipient_name', case when p_is_gift then pg_catalog.btrim(p_gift_recipient_name) end,
    'gift_recipient_phone', case when p_is_gift then pg_catalog.btrim(p_gift_recipient_phone) end,
    'gift_message', case when p_is_gift then nullif(pg_catalog.btrim(p_gift_message), '') end,
    'gift_packaging_selected', p_gift_packaging_selected,
    'gift_packaging_fee', v_fee,
    'save_new_address', p_save_new_address
  );
  if v_existing_payload is not null and v_existing_payload is distinct from v_payload then
    raise exception using errcode = '22023', message = 'This checkout attempt was already used for different gift or address details.';
  end if;
  if v_existing_payload is null then
    update private.cod_order_idempotency as b set gift_payload = v_payload
    where b.user_id = v_user_id and b.idempotency_key = p_idempotency_key;
    perform pg_catalog.set_config('drbeauty.gift_order_id', v_order_id::text, true);
    update public.orders as o set
      additional_phone = nullif(pg_catalog.btrim(p_additional_phone), ''),
      is_gift = p_is_gift,
      gift_recipient_name = case when p_is_gift then pg_catalog.btrim(p_gift_recipient_name) end,
      gift_recipient_phone = case when p_is_gift then pg_catalog.btrim(p_gift_recipient_phone) end,
      gift_message = case when p_is_gift then nullif(pg_catalog.btrim(p_gift_message), '') end,
      gift_packaging_selected = p_gift_packaging_selected,
      gift_packaging_fee_amount = v_fee,
      total_amount = o.subtotal + o.shipping_amount + v_fee - o.discount_amount
    where o.id = v_order_id and o.user_id = v_user_id;
    if p_save_new_address then
      insert into public.customer_addresses (
        user_id, recipient_name, phone, governorate, city, address_line, delivery_notes, is_default
      ) values (
        v_user_id,
        case when p_is_gift then pg_catalog.btrim(p_gift_recipient_name) else pg_catalog.btrim(p_customer_name) end,
        case when p_is_gift then pg_catalog.btrim(p_gift_recipient_phone) else pg_catalog.btrim(p_customer_phone) end,
        pg_catalog.btrim(v_governorate), pg_catalog.btrim(v_city), pg_catalog.btrim(v_address_line),
        nullif(pg_catalog.btrim(v_delivery_notes), ''), false
      );
    end if;
  end if;
  select o.order_number, o.order_status, o.total_amount, o.currency
    into v_order_number, v_order_status, v_total, v_currency
  from public.orders as o where o.id = v_order_id and o.user_id = v_user_id;
  return query select v_order_number, v_order_status, v_total, v_currency;
end;
$$;

revoke all on function public.create_cod_order_with_whatsapp_consent(
  jsonb, uuid, text, text, text, text, text, boolean, text, text, uuid, text, boolean, text, text, text, boolean, boolean
) from public, anon, service_role;
grant execute on function public.create_cod_order_with_whatsapp_consent(
  jsonb, uuid, text, text, text, text, text, boolean, text, text, uuid, text, boolean, text, text, text, boolean, boolean
) to authenticated;

commit;
