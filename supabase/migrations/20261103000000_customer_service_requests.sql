begin;

-- Customer-submitted consultation and support requests. Submission is through
-- a narrow authenticated RPC so customer identity, email, and order ownership
-- are derived or verified in PostgreSQL.
create table public.customer_service_requests (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete cascade,
  request_type text not null check (request_type in ('beauty_tips', 'support')),
  category text not null,
  question text not null check (pg_catalog.length(pg_catalog.btrim(question)) between 10 and 4000),
  product_id uuid references public.products (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  preferred_contact_method text not null check (preferred_contact_method in ('email', 'phone', 'whatsapp')),
  contact_value text not null check (pg_catalog.length(pg_catalog.btrim(contact_value)) between 3 and 320),
  status text not null default 'new'
    check (status in ('new', 'in_review', 'awaiting_customer', 'resolved', 'closed')),
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint customer_service_requests_category_check check (
    (request_type = 'beauty_tips' and category in (
      'skincare', 'haircare', 'product_selection', 'specific_product', 'other'
    ) and order_id is null)
    or
    (request_type = 'support' and category in (
      'order_cancellation', 'refund_request', 'delayed_order',
      'missing_item', 'incorrect_item', 'general'
    ) and product_id is null)
  )
);

create index customer_service_requests_customer_recent_idx
  on public.customer_service_requests (customer_id, created_at desc);
create index customer_service_requests_admin_queue_idx
  on public.customer_service_requests (status, created_at desc);
create index customer_service_requests_order_idx
  on public.customer_service_requests (order_id)
  where order_id is not null;

alter table public.customer_service_requests enable row level security;
revoke all privileges on table public.customer_service_requests
  from public, anon, authenticated, service_role;
grant select on public.customer_service_requests to authenticated;

create policy customer_service_requests_read_own_or_admin
  on public.customer_service_requests
  for select to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_admin()));

create function private.set_customer_service_request_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;

revoke all on function private.set_customer_service_request_updated_at()
  from public, anon, authenticated, service_role;

create trigger customer_service_requests_set_updated_at
  before update on public.customer_service_requests
  for each row execute function private.set_customer_service_request_updated_at();

-- Internal notes are kept in a separate admin-only table because customer
-- accounts may read their own request row but must never see staff notes.
create table public.customer_service_request_notes (
  request_id uuid primary key references public.customer_service_requests (id) on delete cascade,
  notes text check (notes is null or pg_catalog.length(notes) <= 4000),
  updated_at timestamptz not null default pg_catalog.clock_timestamp()
);
alter table public.customer_service_request_notes enable row level security;
revoke all privileges on table public.customer_service_request_notes
  from public, anon, authenticated, service_role;
grant select on public.customer_service_request_notes to authenticated;
create policy customer_service_request_notes_admin_read
  on public.customer_service_request_notes
  for select to authenticated
  using ((select private.is_admin()));

create function private.set_customer_service_request_notes_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end;
$$;
revoke all on function private.set_customer_service_request_notes_updated_at()
  from public, anon, authenticated, service_role;
create trigger customer_service_request_notes_set_updated_at
  before update on public.customer_service_request_notes
  for each row execute function private.set_customer_service_request_notes_updated_at();

-- The inbox keeps its existing order events and gains request/status events.
-- Existing rows remain valid and are not backfilled or rewritten.
alter table public.admin_notifications
  alter column order_id drop not null,
  add column service_request_id uuid
    constraint admin_notifications_service_request_id_fkey
    references public.customer_service_requests (id) on delete cascade;

alter table public.admin_notifications
  drop constraint admin_notifications_event_type_check,
  drop constraint admin_notifications_event_source_check,
  add constraint admin_notifications_event_type_check check (
    event_type in (
      'order_created', 'order_cancelled', 'order_status_changed',
      'beauty_tips_request', 'support_request'
    )
  ),
  add constraint admin_notifications_event_source_check check (
    (event_type = 'order_created' and order_id is not null
      and status_event_id is null and service_request_id is null)
    or
    (event_type in ('order_cancelled', 'order_status_changed') and order_id is not null
      and status_event_id is not null and service_request_id is null)
    or
    (event_type in ('beauty_tips_request', 'support_request') and order_id is null
      and status_event_id is null and service_request_id is not null)
  );

create unique index admin_notifications_status_event_uidx
  on public.admin_notifications (recipient_user_id, status_event_id)
  where event_type = 'order_status_changed';
create unique index admin_notifications_service_request_uidx
  on public.admin_notifications (recipient_user_id, service_request_id)
  where service_request_id is not null;

create function private.notify_admin_of_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.to_status <> 'cancelled' then
    insert into public.admin_notifications (
      recipient_user_id, event_type, order_id, status_event_id
    )
    select role_row.user_id, 'order_status_changed', new.order_id, new.id
    from public.user_roles as role_row
    where role_row.role = 'admin'
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create function private.notify_admin_of_customer_service_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted integer;
begin
  if new.request_type = 'beauty_tips' then
    insert into public.admin_notifications (
      recipient_user_id, event_type, service_request_id
    )
    select role_row.user_id, 'beauty_tips_request', new.id
    from public.user_roles as role_row
    where role_row.role = 'admin'
    on conflict do nothing;
  else
    insert into public.admin_notifications (
      recipient_user_id, event_type, service_request_id
    )
    select role_row.user_id, 'support_request', new.id
    from public.user_roles as role_row
    where role_row.role = 'admin'
    on conflict do nothing;
  end if;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    raise exception using errcode = 'P0001',
      message = 'No administrator is available to receive this request.';
  end if;
  return new;
end;
$$;

revoke all on function private.notify_admin_of_order_status_change()
  from public, anon, authenticated, service_role;
revoke all on function private.notify_admin_of_customer_service_request()
  from public, anon, authenticated, service_role;

create trigger order_status_events_notify_admin_update
  after insert on private.order_status_events
  for each row execute function private.notify_admin_of_order_status_change();
create trigger customer_service_requests_notify_admin
  after insert on public.customer_service_requests
  for each row execute function private.notify_admin_of_customer_service_request();

-- Only this authenticated RPC may submit requests. It derives the customer,
-- snapshots the Auth email for email replies, and checks optional references.
create function public.submit_customer_service_request(
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
declare
  v_customer_id uuid := auth.uid();
  v_email text;
  v_contact_value text;
  v_request_id uuid;
begin
  if v_customer_id is null then
    raise exception using errcode = '28000', message = 'Authentication is required.';
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
  else
    v_contact_value := pg_catalog.btrim(coalesce(p_contact_value, ''));
    if p_contact_value is null
       or pg_catalog.length(v_contact_value) not between 7 and 40
       or v_contact_value !~ '^[0-9+(). -]+$'
       or v_contact_value !~ '[0-9]' then
      raise exception using errcode = '22023', message = 'Enter a valid contact number.';
    end if;
  end if;

  insert into public.customer_service_requests (
    customer_id, request_type, category, question, product_id, order_id,
    preferred_contact_method, contact_value
  ) values (
    v_customer_id, p_request_type, p_category, pg_catalog.btrim(p_question),
    p_product_id, p_order_id, p_contact_method, v_contact_value
  ) returning id into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.submit_customer_service_request(
  text, text, text, uuid, uuid, text, text
) from public, anon, service_role;
grant execute on function public.submit_customer_service_request(
  text, text, text, uuid, uuid, text, text
) to authenticated;

create function public.update_customer_service_request(
  p_request_id uuid,
  p_status text,
  p_admin_notes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  if auth.uid() is null or not private.is_admin() then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_request_id is null
     or p_status is null
     or p_status not in ('new', 'in_review', 'awaiting_customer', 'resolved', 'closed')
     or (p_admin_notes is not null and pg_catalog.length(p_admin_notes) > 4000) then
    raise exception using errcode = '22023', message = 'The request update is invalid.';
  end if;

  update public.customer_service_requests as request_row
  set status = p_status
  where request_row.id = p_request_id
  returning request_row.id into v_request_id;
  if v_request_id is null then
    raise exception using errcode = 'P0002', message = 'The customer request is unavailable.';
  end if;

  insert into public.customer_service_request_notes (request_id, notes)
  values (v_request_id, nullif(pg_catalog.btrim(p_admin_notes), ''))
  on conflict (request_id) do update
    set notes = excluded.notes;

  return v_request_id;
end;
$$;
revoke all on function public.update_customer_service_request(uuid, text, text)
  from public, anon, service_role;
grant execute on function public.update_customer_service_request(uuid, text, text)
  to authenticated;

commit;
