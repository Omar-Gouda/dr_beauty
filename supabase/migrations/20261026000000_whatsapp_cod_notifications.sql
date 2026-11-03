begin;

-- Generalize the private delivery outbox to email and WhatsApp while keeping
-- existing email rows on the email channel.
alter table public.email_deliveries
  add column channel text not null default 'email',
  add column recipient_phone text,
  add column consented_at timestamptz,
  add column consent_source text,
  add column consent_version text;

alter table public.email_deliveries
  alter column recipient_email drop not null;

alter table public.email_deliveries
  drop constraint email_deliveries_check;

alter table public.email_deliveries
  add constraint email_deliveries_channel_check
    check (channel in ('email', 'whatsapp')),
  add constraint email_deliveries_channel_recipient_check
    check (
      (channel = 'email'
        and recipient_email is not null
        and recipient_phone is null
        and consented_at is null
        and consent_source is null
        and consent_version is null)
      or
      (channel = 'whatsapp'
        and recipient_email is null
        and recipient_phone is not null
        and pg_catalog.length(recipient_phone) between 7 and 40
        and consented_at is not null
        and consent_source = 'checkout'
        and consent_version = 'cod-order-whatsapp-v1')
    ),
  add constraint email_deliveries_order_channel_check
    check (
      (channel = 'email'
        and (
          (order_id is not null and campaign_id is null and subscriber_id is null
            and delivery_type in ('order_confirmation', 'order_update'))
          or
          (order_id is null and campaign_id is not null and subscriber_id is not null
            and delivery_type = 'newsletter_campaign')
        ))
      or
      (channel = 'whatsapp'
        and order_id is not null and campaign_id is null and subscriber_id is null
        and delivery_type in ('order_confirmation', 'order_update'))
    );

drop index public.email_deliveries_order_type_uidx;
create unique index email_deliveries_order_type_uidx
  on public.email_deliveries (order_id, delivery_type, channel)
  where order_id is not null;

-- A NULL value means the order was created through the existing email-only
-- RPC. The consent-aware wrapper binds the explicit decision on first use.
alter table private.cod_order_idempotency
  add column whatsapp_consent boolean;

-- Preserve the existing email enqueue behavior using the channel-aware unique
-- index. The queue remains transactional and does not send mail.
create or replace function private.enqueue_cod_order_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.customer_email is null
     or pg_catalog.length(new.customer_email) not between 3 and 320 then
    raise exception using
      errcode = '23514',
      message = 'A valid customer email is required to create this order.';
  end if;

  insert into public.email_deliveries (
    order_id, delivery_type, recipient_email, idempotency_key, channel
  ) values (
    new.id,
    'order_confirmation',
    new.customer_email,
    'order-confirmation:' || new.id::text,
    'email'
  )
  on conflict (order_id, delivery_type, channel) where order_id is not null do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_cod_order_confirmation()
  from public, anon, authenticated, service_role;

-- Future checkout UI must collect explicit opt-in and call this wrapper. The
-- underlying order RPC, stock reservation, email queue, and this WhatsApp queue
-- all run within the same PostgREST transaction.
create function public.create_cod_order_with_whatsapp_consent(
  p_items jsonb,
  p_idempotency_key uuid,
  p_customer_name text,
  p_customer_phone text,
  p_governorate text,
  p_city text,
  p_address_line text,
  p_whatsapp_consent boolean,
  p_delivery_notes text default null,
  p_promotion_code text default null
)
returns table (
  order_number bigint,
  order_status text,
  total_amount numeric,
  currency text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_order_id uuid;
  v_order_phone text;
  v_existing_consent boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if p_whatsapp_consent is null then
    raise exception using errcode = '22023', message = 'WhatsApp consent must be specified.';
  end if;

  -- Calling the original authenticated RPC keeps all existing validation,
  -- price/stock checks, order snapshots, and payload-bound idempotency intact.
  perform 1
  from public.create_cod_order(
    p_items,
    p_idempotency_key,
    p_customer_name,
    p_customer_phone,
    p_governorate,
    p_city,
    p_address_line,
    p_delivery_notes,
    p_promotion_code
  );

  select binding.whatsapp_consent, order_row.id, order_row.customer_phone
    into v_existing_consent, v_order_id, v_order_phone
  from private.cod_order_idempotency as binding
  join public.orders as order_row
    on order_row.id = binding.order_id
   and order_row.user_id = binding.user_id
   and order_row.idempotency_key = binding.idempotency_key
  where binding.user_id = v_user_id
    and binding.idempotency_key = p_idempotency_key
  for update of binding;

  if not found then
    raise exception using errcode = 'P0001', message = 'The saved checkout confirmation is unavailable.';
  end if;
  if v_existing_consent is not null and v_existing_consent is distinct from p_whatsapp_consent then
    raise exception using errcode = '22023', message = 'This checkout attempt already has a different WhatsApp consent choice.';
  end if;

  update private.cod_order_idempotency
  set whatsapp_consent = p_whatsapp_consent
  where user_id = v_user_id
    and idempotency_key = p_idempotency_key
    and whatsapp_consent is null;

  if p_whatsapp_consent then
    insert into public.email_deliveries (
      order_id,
      delivery_type,
      recipient_phone,
      idempotency_key,
      channel,
      consented_at,
      consent_source,
      consent_version
    ) values (
      v_order_id,
      'order_confirmation',
      v_order_phone,
      'whatsapp-order-confirmation:' || v_order_id::text,
      'whatsapp',
      pg_catalog.clock_timestamp(),
      'checkout',
      'cod-order-whatsapp-v1'
    )
    on conflict (order_id, delivery_type, channel) where order_id is not null do nothing;
  end if;

  return query
  select order_row.order_number, order_row.order_status, order_row.total_amount, order_row.currency
  from public.orders as order_row
  where order_row.id = v_order_id and order_row.user_id = v_user_id;
end;
$$;

revoke all on function public.create_cod_order_with_whatsapp_consent(
  jsonb, uuid, text, text, text, text, text, boolean, text, text
) from public, anon, service_role;
grant execute on function public.create_cod_order_with_whatsapp_consent(
  jsonb, uuid, text, text, text, text, text, boolean, text, text
) to authenticated;

commit;
