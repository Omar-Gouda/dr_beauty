begin;

-- This claim path is deliberately limited to email. It mirrors the shared
-- worker's lease/fencing/retry contract without touching WhatsApp rows.
create function public.claim_order_email_notifications(
  p_batch_size integer default 1,
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

  -- Close only exhausted email work. In particular, this operation never
  -- changes WhatsApp status, lease, claim token, attempt count, or error.
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
    and delivery.channel = 'email'
    and delivery.delivery_type in ('order_confirmation', 'order_update')
    and delivery.order_id is not null
    and delivery.campaign_id is null
    and delivery.subscriber_id is null;

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
      and delivery.channel = 'email'
      and delivery.delivery_type in ('order_confirmation', 'order_update')
      and delivery.order_id is not null
      and delivery.campaign_id is null
      and delivery.subscriber_id is null
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

revoke all on function public.claim_order_email_notifications(integer, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.claim_order_email_notifications(integer, integer)
  to service_role;

commit;
