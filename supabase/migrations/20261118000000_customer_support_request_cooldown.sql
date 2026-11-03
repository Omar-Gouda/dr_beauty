begin;

-- Private idempotency binding: the key is not a bearer credential and is
-- never exposed through a public RPC or granted table access.
create table private.customer_service_request_submissions (
  customer_id uuid not null references auth.users (id) on delete cascade,
  submission_key uuid not null,
  request_id uuid not null unique
    references public.customer_service_requests (id) on delete cascade,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  primary key (customer_id, submission_key)
);

alter table private.customer_service_request_submissions enable row level security;
revoke all on table private.customer_service_request_submissions
  from public, anon, authenticated, service_role;

-- The existing customer_recent index supports this customer/time lookup.
create or replace function public.submit_customer_service_request(
  p_request_type text,
  p_category text,
  p_question text,
  p_product_id uuid,
  p_order_id uuid,
  p_contact_method text,
  p_contact_value text,
  p_submission_key uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_customer_id uuid := auth.uid();
  v_email text;
  v_contact_value text;
  v_request_id uuid;
  v_existing_request public.customer_service_requests%rowtype;
  v_now timestamptz;
begin
  if v_customer_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
  end if;
  if p_submission_key is null then
    raise exception using errcode = '22023', message = 'A request submission key is required.';
  end if;

  if p_request_type is null or p_request_type not in ('beauty_tips', 'support')
     or p_contact_method is null or p_contact_method not in ('email', 'phone', 'whatsapp')
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_question, ''))) not between 10 and 4000 then
    raise exception using errcode = '22023', message = 'The request details are invalid.';
  end if;

  if p_category is null or (p_request_type = 'beauty_tips' and p_category not in (
        'skincare', 'haircare', 'product_selection', 'specific_product', 'other'
      ))
     or (p_request_type = 'support' and p_category not in (
        'order_cancellation', 'refund_request', 'delayed_order',
        'missing_item', 'incorrect_item', 'general'
      )) then
    raise exception using errcode = '22023', message = 'The request category is invalid.';
  end if;

  if p_request_type = 'beauty_tips' and p_order_id is not null then
    raise exception using errcode = '22023', message = 'The request references are invalid.';
  end if;
  if p_request_type = 'support' and p_product_id is not null then
    raise exception using errcode = '22023', message = 'The request references are invalid.';
  end if;
  if p_contact_method <> 'email' then
    v_contact_value := pg_catalog.btrim(coalesce(p_contact_value, ''));
    if p_contact_value is null
       or pg_catalog.length(v_contact_value) not between 7 and 40
       or v_contact_value !~ '^[0-9+(). -]+$'
       or v_contact_value !~ '[0-9]' then
      raise exception using errcode = '22023', message = 'Enter a valid contact number.';
    end if;
  end if;

  -- Serialize all submissions from one account. The transaction lock protects
  -- the cooldown check and insert from simultaneous requests with distinct keys.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('customer-service-submission:' || v_customer_id::text, 0)
  );

  -- A retry of a committed submission returns the original row before the
  -- cooldown check, and therefore does not create another admin notification.
  select request_row.*
    into v_existing_request
  from private.customer_service_request_submissions as submission
  join public.customer_service_requests as request_row
    on request_row.id = submission.request_id
  where submission.customer_id = v_customer_id
    and submission.submission_key = p_submission_key;

  if found then
    if v_existing_request.request_type is distinct from p_request_type
       or v_existing_request.category is distinct from p_category
       or v_existing_request.question is distinct from pg_catalog.btrim(p_question)
       or v_existing_request.product_id is distinct from p_product_id
       or v_existing_request.order_id is distinct from p_order_id
       or v_existing_request.preferred_contact_method is distinct from p_contact_method
       or (p_contact_method <> 'email'
         and v_existing_request.contact_value is distinct from v_contact_value) then
      raise exception using
        errcode = 'PZ003',
        message = 'This request attempt was already used for different details.';
    end if;
    return v_existing_request.id;
  end if;

  if p_product_id is not null and not exists (
    select 1 from public.products as product_row
    where product_row.id = p_product_id and product_row.is_active
  ) then
    raise exception using errcode = '22023', message = 'The selected product is unavailable.';
  end if;

  if p_order_id is not null and not exists (
    select 1 from public.orders as order_row
    where order_row.id = p_order_id and order_row.user_id = v_customer_id
  ) then
    raise exception using errcode = '22023', message = 'The selected order is unavailable.';
  end if;
  if p_request_type = 'support' and p_category in (
    'order_cancellation', 'refund_request', 'delayed_order', 'missing_item', 'incorrect_item'
  ) and p_order_id is null then
    raise exception using errcode = '22023', message = 'Select the order related to this request.';
  end if;

  if p_contact_method = 'email' then
    select auth_user.email into v_email
    from auth.users as auth_user
    where auth_user.id = v_customer_id;
    if v_email is null or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
      raise exception using errcode = '22023', message = 'An account email is unavailable.';
    end if;
    v_contact_value := v_email;
  end if;

  v_now := pg_catalog.clock_timestamp();
  if p_request_type = 'support' and exists (
    select 1
    from public.customer_service_requests as existing_request
    where existing_request.customer_id = v_customer_id
      and existing_request.request_type = 'support'
      and existing_request.created_at > v_now - interval '15 minutes'
  ) then
    raise exception using
      errcode = 'PZ001',
      message = 'Please wait before submitting another support request.';
  end if;

  insert into public.customer_service_requests (
    customer_id, request_type, category, question, product_id, order_id,
    preferred_contact_method, contact_value
  ) values (
    v_customer_id, p_request_type, p_category, pg_catalog.btrim(p_question),
    p_product_id, p_order_id, p_contact_method, v_contact_value
  ) returning id into v_request_id;

  insert into private.customer_service_request_submissions (
    customer_id, submission_key, request_id
  ) values (
    v_customer_id, p_submission_key, v_request_id
  );

  return v_request_id;
end;
$$;

revoke all on function public.submit_customer_service_request(
  text, text, text, uuid, uuid, text, text, uuid
) from public, anon, service_role;
grant execute on function public.submit_customer_service_request(
  text, text, text, uuid, uuid, text, text, uuid
) to authenticated;

-- Preserve the original RPC signature for existing callers. It still passes
-- through the cooldown guard, but callers needing retry idempotency must use
-- the new key-aware signature.
create or replace function public.submit_customer_service_request(
  p_request_type text,
  p_category text,
  p_question text,
  p_product_id uuid,
  p_order_id uuid,
  p_contact_method text,
  p_contact_value text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.submit_customer_service_request(
    p_request_type, p_category, p_question, p_product_id, p_order_id,
    p_contact_method, p_contact_value, pg_catalog.gen_random_uuid()
  );
end;
$$;

commit;

