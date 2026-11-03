begin;

-- Add a per-claim fencing token and explicit terminal state. Existing queue
-- rows retain their current status, retry count, schedule, and lease.
alter table public.email_deliveries
  add column claim_token uuid;

alter table public.email_deliveries
  drop constraint email_deliveries_status_check,
  add constraint email_deliveries_status_check
    check (status in ('queued', 'processing', 'sent', 'failed', 'terminal_failed'));

create unique index email_deliveries_claim_token_uidx
  on public.email_deliveries (claim_token)
  where claim_token is not null;

create index email_deliveries_worker_due_idx
  on public.email_deliveries (next_attempt_at, created_at, id)
  where status in ('queued', 'failed')
    and channel in ('email', 'whatsapp')
    and delivery_type in ('order_confirmation', 'order_update')
    and order_id is not null
    and campaign_id is null
    and subscriber_id is null;

create index email_deliveries_worker_lease_idx
  on public.email_deliveries (locked_until, id)
  where status = 'processing';

create function public.claim_order_notifications(
  p_batch_size integer default 10,
  p_lease_seconds integer default 120
)
returns table (
  delivery_id uuid,
  channel text,
  delivery_type text,
  order_id uuid,
  recipient_email text,
  recipient_phone text,
  idempotency_key text,
  order_status text,
  status_payload jsonb,
  attempt_count integer,
  claim_token uuid,
  lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_max_attempts constant integer := 5;
begin
  if p_batch_size is null or p_batch_size < 1 or p_batch_size > 25 then
    raise exception using errcode = '22023', message = 'The notification batch size is invalid.';
  end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'The notification lease duration is invalid.';
  end if;

  -- Close exhausted work, including a final attempt abandoned after its lease.
  update public.email_deliveries as delivery
  set status = 'terminal_failed',
      locked_until = null,
      claim_token = null,
      last_error = 'retry_limit_exceeded'
  where delivery.status in ('queued', 'failed', 'processing')
    and delivery.attempt_count >= v_max_attempts
    and (
      (delivery.status in ('queued', 'failed') and delivery.next_attempt_at <= v_now)
      or (delivery.status = 'processing'
        and (delivery.locked_until is null or delivery.locked_until <= v_now))
    )
    and delivery.channel in ('email', 'whatsapp')
    and delivery.delivery_type in ('order_confirmation', 'order_update')
    and delivery.order_id is not null
    and delivery.campaign_id is null
    and delivery.subscriber_id is null;

  -- Fail closed if the WhatsApp consent binding/evidence is absent or no longer
  -- matches the exact order-specific checkout consent snapshot.
  update public.email_deliveries as delivery
  set status = 'terminal_failed',
      locked_until = null,
      claim_token = null,
      last_error = 'whatsapp_consent_invalid'
  where delivery.status in ('queued', 'failed', 'processing')
    and delivery.attempt_count < v_max_attempts
    and (
      (delivery.status in ('queued', 'failed') and delivery.next_attempt_at <= v_now)
      or (delivery.status = 'processing'
        and (delivery.locked_until is null or delivery.locked_until <= v_now))
    )
    and delivery.channel = 'whatsapp'
    and delivery.delivery_type in ('order_confirmation', 'order_update')
    and delivery.order_id is not null
    and not exists (
      select 1
      from private.cod_order_idempotency as binding
      join public.email_deliveries as confirmation
        on confirmation.order_id = binding.order_id
       and confirmation.channel = 'whatsapp'
       and confirmation.delivery_type = 'order_confirmation'
       and confirmation.recipient_phone = delivery.recipient_phone
       and confirmation.consented_at = delivery.consented_at
       and confirmation.consent_source = delivery.consent_source
       and confirmation.consent_version = delivery.consent_version
      where binding.order_id = delivery.order_id
        and binding.whatsapp_consent is true
        and confirmation.consented_at is not null
        and confirmation.consent_source = 'checkout'
        and confirmation.consent_version = 'cod-order-whatsapp-v1'
    );

  return query
  with picked as materialized (
    select delivery.id
    from public.email_deliveries as delivery
    where delivery.status in ('queued', 'failed', 'processing')
      and delivery.attempt_count < v_max_attempts
      and (
        (delivery.status in ('queued', 'failed') and delivery.next_attempt_at <= v_now)
        or (delivery.status = 'processing'
          and (delivery.locked_until is null or delivery.locked_until <= v_now))
      )
      and delivery.channel in ('email', 'whatsapp')
      and delivery.delivery_type in ('order_confirmation', 'order_update')
      and delivery.order_id is not null
      and delivery.campaign_id is null
      and delivery.subscriber_id is null
      and (
        delivery.channel <> 'whatsapp'
        or exists (
          select 1
          from private.cod_order_idempotency as binding
          join public.email_deliveries as confirmation
            on confirmation.order_id = binding.order_id
           and confirmation.channel = 'whatsapp'
           and confirmation.delivery_type = 'order_confirmation'
           and confirmation.recipient_phone = delivery.recipient_phone
           and confirmation.consented_at = delivery.consented_at
           and confirmation.consent_source = delivery.consent_source
           and confirmation.consent_version = delivery.consent_version
          where binding.order_id = delivery.order_id
            and binding.whatsapp_consent is true
            and confirmation.consented_at is not null
            and confirmation.consent_source = 'checkout'
            and confirmation.consent_version = 'cod-order-whatsapp-v1'
        )
      )
    order by
      case when delivery.status = 'processing'
           then coalesce(delivery.locked_until, '-infinity'::timestamptz)
           else delivery.next_attempt_at end,
      delivery.created_at,
      delivery.id
    for update of delivery skip locked
    limit p_batch_size
  ), claimed as (
    update public.email_deliveries as delivery
    set status = 'processing',
        locked_until = pg_catalog.clock_timestamp()
          + pg_catalog.make_interval(secs => p_lease_seconds),
        claim_token = pg_catalog.gen_random_uuid(),
        attempt_count = delivery.attempt_count + 1
    from picked
    where delivery.id = picked.id
    returning delivery.id, delivery.channel, delivery.delivery_type,
      delivery.order_id, delivery.recipient_email, delivery.recipient_phone,
      delivery.idempotency_key, delivery.order_status, delivery.status_payload,
      delivery.attempt_count, delivery.claim_token, delivery.locked_until
  )
  select claimed.id, claimed.channel, claimed.delivery_type, claimed.order_id,
    claimed.recipient_email, claimed.recipient_phone, claimed.idempotency_key,
    claimed.order_status, claimed.status_payload, claimed.attempt_count,
    claimed.claim_token, claimed.locked_until
  from claimed;
end;
$$;

create function public.complete_order_notification(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider_message_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_message_id text;
  v_current_status text;
  v_current_token uuid;
  v_current_lease timestamptz;
  v_current_channel text;
  v_current_type text;
  v_current_order_id uuid;
  v_current_campaign_id uuid;
  v_current_subscriber_id uuid;
begin
  if p_delivery_id is null or p_claim_token is null then
    raise exception using errcode = '22023', message = 'A valid notification claim is required.';
  end if;

  if p_provider_message_id is not null then
    v_provider_message_id := nullif(pg_catalog.btrim(p_provider_message_id), '');
    if v_provider_message_id is null or pg_catalog.length(v_provider_message_id) > 500 then
      raise exception using errcode = '22023', message = 'The provider message reference is invalid.';
    end if;
  end if;

  select delivery.status, delivery.claim_token, delivery.locked_until,
    delivery.channel, delivery.delivery_type, delivery.order_id,
    delivery.campaign_id, delivery.subscriber_id
  into v_current_status, v_current_token, v_current_lease,
    v_current_channel, v_current_type, v_current_order_id,
    v_current_campaign_id, v_current_subscriber_id
  from public.email_deliveries as delivery
  where delivery.id = p_delivery_id
  for update;

  if not found
     or v_current_status <> 'processing'
     or v_current_token is distinct from p_claim_token
     or v_current_lease is null
     or v_current_lease <= pg_catalog.clock_timestamp()
     or v_current_channel not in ('email', 'whatsapp')
     or v_current_type not in ('order_confirmation', 'order_update')
     or v_current_order_id is null
     or v_current_campaign_id is not null
     or v_current_subscriber_id is not null then
    raise exception using errcode = 'P0001', message = 'The notification claim is no longer valid.';
  end if;

  update public.email_deliveries as delivery
  set status = 'sent',
      sent_at = pg_catalog.clock_timestamp(),
      provider_message_id = v_provider_message_id,
      locked_until = null,
      claim_token = null,
      last_error = null
  where delivery.id = p_delivery_id
    and delivery.status = 'processing'
    and delivery.claim_token = p_claim_token;
end;
$$;

create function public.fail_order_notification(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_error_code text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_max_attempts constant integer := 5;
  v_error_code text;
  v_next_status text;
  v_backoff_seconds integer;
  v_claim_lease timestamptz;
begin
  if p_delivery_id is null or p_claim_token is null then
    raise exception using errcode = '22023', message = 'A valid notification claim is required.';
  end if;

  v_error_code := nullif(pg_catalog.btrim(p_error_code), '');
  if v_error_code is null or v_error_code not in (
    'provider_timeout', 'provider_unavailable', 'rate_limited',
    'invalid_recipient', 'consent_invalid', 'provider_rejected',
    'invalid_message', 'unknown_failure'
  ) then
    raise exception using errcode = '22023', message = 'The notification failure code is invalid.';
  end if;

  select delivery.locked_until,
    case
    when v_error_code in ('provider_timeout', 'provider_unavailable', 'rate_limited', 'unknown_failure')
      and delivery.attempt_count < v_max_attempts then 'failed'
    else 'terminal_failed'
  end,
  case delivery.attempt_count
    when 1 then 30
    when 2 then 60
    when 3 then 120
    else 240
  end
  into v_claim_lease, v_next_status, v_backoff_seconds
  from public.email_deliveries as delivery
  where delivery.id = p_delivery_id
    and delivery.status = 'processing'
    and delivery.claim_token = p_claim_token
    and delivery.channel in ('email', 'whatsapp')
    and delivery.delivery_type in ('order_confirmation', 'order_update')
    and delivery.order_id is not null
    and delivery.campaign_id is null
    and delivery.subscriber_id is null
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'The notification claim is no longer valid.';
  end if;

  if v_claim_lease is null or v_claim_lease <= pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'The notification claim is no longer valid.';
  end if;

  update public.email_deliveries as delivery
  set status = v_next_status,
      next_attempt_at = case
        when v_next_status = 'failed'
          then v_now + pg_catalog.make_interval(secs => v_backoff_seconds)
        else delivery.next_attempt_at
      end,
      locked_until = null,
      claim_token = null,
      last_error = v_error_code
  where delivery.id = p_delivery_id
    and delivery.status = 'processing'
    and delivery.claim_token = p_claim_token;

  return v_next_status;
end;
$$;

-- The existing migrations explicitly grant the server-only Supabase
-- service_role table access. No customer or anonymous role can execute these
-- queue operations; functions execute as their protected owner.
revoke all on function public.claim_order_notifications(integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_order_notification(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_order_notification(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_order_notifications(integer, integer) to service_role;
grant execute on function public.complete_order_notification(uuid, uuid, text) to service_role;
grant execute on function public.fail_order_notification(uuid, uuid, text) to service_role;

commit;
