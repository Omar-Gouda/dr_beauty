begin;

-- Keep administrator email delivery separate from customer-facing
-- email_deliveries. One row represents one administrator/order pair.
create table private.admin_order_email_deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  recipient_email text,
  idempotency_key text not null unique,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'failed', 'sent', 'terminal_failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default pg_catalog.clock_timestamp(),
  locked_until timestamptz,
  claim_token uuid,
  provider_message_id text,
  last_error_code text check (last_error_code is null or last_error_code in (
    'rate_limited', 'provider_rejected', 'invalid_message', 'invalid_recipient',
    'retry_limit_exceeded', 'unknown_failure'
  )),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  sent_at timestamptz,
  constraint admin_order_email_recipient_check check (
    recipient_email is null
    or (pg_catalog.length(recipient_email) between 3 and 320
      and recipient_email !~ '[[:space:]]')
  ),
  constraint admin_order_email_recipient_state_check check (
    recipient_email is not null
    or (status = 'terminal_failed' and last_error_code = 'invalid_recipient')
  ),
  constraint admin_order_email_lease_state_check check (
    (status = 'processing' and claim_token is not null and locked_until is not null)
    or (status <> 'processing' and claim_token is null and locked_until is null)
  ),
  constraint admin_order_email_sent_state_check check (
    (status = 'sent' and sent_at is not null and provider_message_id is not null)
    or (status <> 'sent' and sent_at is null)
  ),
  constraint admin_order_email_admin_order_uidx unique (order_id, recipient_user_id)
);

alter table private.admin_order_email_deliveries enable row level security;
revoke all privileges on table private.admin_order_email_deliveries
  from public, anon, authenticated, service_role;

create unique index admin_order_email_claim_token_uidx
  on private.admin_order_email_deliveries (claim_token)
  where claim_token is not null;
create index admin_order_email_due_idx
  on private.admin_order_email_deliveries (next_attempt_at, created_at, id)
  where status in ('queued', 'failed');
create index admin_order_email_lease_idx
  on private.admin_order_email_deliveries (locked_until, id)
  where status = 'processing';

-- The existing in-app order_created notification is the trusted fan-out
-- source: it is inserted once for each user_roles admin in the order txn.
-- Snapshot that admin's Auth email here; never accept it from the browser.
create function private.enqueue_admin_order_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_email_valid boolean;
begin
  if new.event_type <> 'order_created' or new.order_id is null then
    return new;
  end if;

  select auth_user.email
    into v_email
  from public.user_roles as role_row
  join auth.users as auth_user on auth_user.id = role_row.user_id
  where role_row.user_id = new.recipient_user_id
    and role_row.role = 'admin';

  v_email_valid := v_email is not null
    and pg_catalog.length(v_email) between 3 and 320
    and v_email !~ '[[:space:]]'
    and v_email ~ '^[^@]+@[^@]+[.][^@]+$';

  insert into private.admin_order_email_deliveries (
    order_id, recipient_user_id, recipient_email, idempotency_key,
    status, last_error_code
  ) values (
    new.order_id,
    new.recipient_user_id,
    case when v_email_valid then v_email else null end,
    'admin-order-created:' || new.order_id::text || ':' || new.recipient_user_id::text,
    case when v_email_valid then 'queued' else 'terminal_failed' end,
    case when v_email_valid then null else 'invalid_recipient' end
  )
  on conflict (order_id, recipient_user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_admin_order_email()
  from public, anon, authenticated, service_role;

create trigger admin_notifications_enqueue_order_email
  after insert on public.admin_notifications
  for each row execute function private.enqueue_admin_order_email();

create function public.claim_admin_order_email_notifications(
  p_lease_seconds integer default 120
)
returns table (
  delivery_id uuid,
  claim_token uuid,
  notification_type text,
  recipient_email text,
  idempotency_key text,
  attempt_count integer,
  lease_expires_at timestamptz,
  order_number text,
  order_created_at timestamptz,
  customer_name text,
  total_amount text,
  currency text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_max_attempts constant integer := 5;
begin
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 900 then
    raise exception using errcode = '22023', message = 'The notification lease duration is invalid.';
  end if;

  update private.admin_order_email_deliveries as delivery
  set status = 'terminal_failed',
      locked_until = null,
      claim_token = null,
      last_error_code = 'retry_limit_exceeded'
  where delivery.status in ('queued', 'failed', 'processing')
    and delivery.attempt_count >= v_max_attempts
    and (
      (delivery.status in ('queued', 'failed') and delivery.next_attempt_at <= v_now)
      or (delivery.status = 'processing'
        and (delivery.locked_until is null or delivery.locked_until <= v_now))
    );

  return query
  with picked as materialized (
    select delivery.id
    from private.admin_order_email_deliveries as delivery
    where delivery.recipient_email is not null
      and exists (
        select 1
        from public.user_roles as role_row
        where role_row.user_id = delivery.recipient_user_id
          and role_row.role = 'admin'
      )
      and delivery.status in ('queued', 'failed', 'processing')
      and delivery.attempt_count < v_max_attempts
      and (
        (delivery.status in ('queued', 'failed') and delivery.next_attempt_at <= v_now)
        or (delivery.status = 'processing'
          and (delivery.locked_until is null or delivery.locked_until <= v_now))
      )
    order by
      case when delivery.status = 'processing'
        then coalesce(delivery.locked_until, '-infinity'::timestamptz)
        else delivery.next_attempt_at end,
      delivery.created_at,
      delivery.id
    for update of delivery skip locked
    limit 1
  ), claimed as (
    update private.admin_order_email_deliveries as delivery
    set status = 'processing',
        locked_until = pg_catalog.clock_timestamp()
          + pg_catalog.make_interval(secs => p_lease_seconds),
        claim_token = pg_catalog.gen_random_uuid(),
        attempt_count = delivery.attempt_count + 1
    from picked
    where delivery.id = picked.id
    returning delivery.id, delivery.claim_token, delivery.recipient_email,
      delivery.idempotency_key, delivery.attempt_count, delivery.locked_until,
      delivery.order_id
  )
  select claimed.id, claimed.claim_token, 'admin_order_created'::text,
    claimed.recipient_email, claimed.idempotency_key, claimed.attempt_count,
    claimed.locked_until, order_row.order_number::text, order_row.created_at,
    order_row.customer_name, order_row.total_amount::text, order_row.currency
  from claimed
  join public.orders as order_row on order_row.id = claimed.order_id;
end;
$$;

create function public.complete_admin_order_email_notification(
  p_delivery_id uuid,
  p_claim_token uuid,
  p_provider_message_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_provider_message_id text := nullif(pg_catalog.btrim(p_provider_message_id), '');
begin
  if p_delivery_id is null or p_claim_token is null
     or v_provider_message_id is null
     or pg_catalog.length(v_provider_message_id) > 500 then
    raise exception using errcode = '22023', message = 'A valid notification claim and provider reference are required.';
  end if;

  update private.admin_order_email_deliveries as delivery
  set status = 'sent',
      sent_at = pg_catalog.clock_timestamp(),
      provider_message_id = v_provider_message_id,
      locked_until = null,
      claim_token = null,
      last_error_code = null
  where delivery.id = p_delivery_id
    and delivery.status = 'processing'
    and delivery.claim_token = p_claim_token
    and delivery.locked_until > pg_catalog.clock_timestamp();

  if not found then
    raise exception using errcode = 'P0001', message = 'The notification claim is no longer valid.';
  end if;
end;
$$;

create function public.fail_admin_order_email_notification(
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
  v_error_code text := nullif(pg_catalog.btrim(p_error_code), '');
  v_attempt_count integer;
  v_lease timestamptz;
  v_next_status text;
  v_backoff_seconds integer;
begin
  if p_delivery_id is null or p_claim_token is null
     or v_error_code is null
     or v_error_code not in ('rate_limited', 'provider_rejected', 'invalid_message', 'unknown_failure') then
    raise exception using errcode = '22023', message = 'The notification failure details are invalid.';
  end if;

  select delivery.attempt_count, delivery.locked_until
    into v_attempt_count, v_lease
  from private.admin_order_email_deliveries as delivery
  where delivery.id = p_delivery_id
    and delivery.status = 'processing'
    and delivery.claim_token = p_claim_token
  for update;

  if not found or v_lease is null or v_lease <= pg_catalog.clock_timestamp() then
    raise exception using errcode = 'P0001', message = 'The notification claim is no longer valid.';
  end if;

  v_next_status := case
    when v_error_code in ('rate_limited', 'unknown_failure')
      and v_attempt_count < v_max_attempts then 'failed'
    else 'terminal_failed'
  end;
  v_backoff_seconds := case v_attempt_count
    when 1 then 30
    when 2 then 60
    when 3 then 120
    else 240
  end;

  update private.admin_order_email_deliveries as delivery
  set status = v_next_status,
      next_attempt_at = case when v_next_status = 'failed'
        then v_now + pg_catalog.make_interval(secs => v_backoff_seconds)
        else delivery.next_attempt_at end,
      locked_until = null,
      claim_token = null,
      last_error_code = v_error_code
  where delivery.id = p_delivery_id
    and delivery.status = 'processing'
    and delivery.claim_token = p_claim_token;

  return v_next_status;
end;
$$;

revoke all on function public.claim_admin_order_email_notifications(integer)
  from public, anon, authenticated, service_role;
revoke all on function public.complete_admin_order_email_notification(uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.fail_admin_order_email_notification(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.claim_admin_order_email_notifications(integer) to service_role;
grant execute on function public.complete_admin_order_email_notification(uuid, uuid, text) to service_role;
grant execute on function public.fail_admin_order_email_notification(uuid, uuid, text) to service_role;

commit;
