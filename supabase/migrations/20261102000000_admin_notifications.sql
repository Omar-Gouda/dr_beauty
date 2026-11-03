begin;

-- Durable admin inbox entries are created in the same transaction as the
-- underlying order or lifecycle event. Only events with implemented sources
-- are represented here: order creation and cancellation.
create table public.admin_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null check (event_type in ('order_created', 'order_cancelled')),
  order_id uuid not null constraint admin_notifications_order_id_fkey
    references public.orders (id) on delete restrict,
  status_event_id uuid constraint admin_notifications_status_event_id_fkey
    references private.order_status_events (id) on delete restrict,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  read_at timestamptz,
  constraint admin_notifications_event_source_check check (
    (event_type = 'order_created' and status_event_id is null)
    or (event_type = 'order_cancelled' and status_event_id is not null)
  )
);

create unique index admin_notifications_order_created_uidx
  on public.admin_notifications (recipient_user_id, order_id)
  where event_type = 'order_created';
create unique index admin_notifications_cancel_event_uidx
  on public.admin_notifications (recipient_user_id, status_event_id)
  where event_type = 'order_cancelled';
create index admin_notifications_recipient_recent_idx
  on public.admin_notifications (recipient_user_id, created_at desc);
create index admin_notifications_recipient_unread_idx
  on public.admin_notifications (recipient_user_id, created_at desc)
  where read_at is null;

alter table public.admin_notifications enable row level security;
revoke all privileges on table public.admin_notifications
  from public, anon, authenticated, service_role;
grant select on public.admin_notifications to authenticated;
grant update (read_at) on public.admin_notifications to authenticated;

create policy admin_notifications_recipient_read on public.admin_notifications
  for select to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and (select private.is_admin())
  );

create policy admin_notifications_recipient_mark_read on public.admin_notifications
  for update to authenticated
  using (
    recipient_user_id = (select auth.uid())
    and (select private.is_admin())
  )
  with check (
    recipient_user_id = (select auth.uid())
    and (select private.is_admin())
  );

create function private.notify_admin_of_new_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_notifications (
    recipient_user_id, event_type, order_id
  )
  select role_row.user_id, 'order_created', new.id
  from public.user_roles as role_row
  where role_row.role = 'admin'
  on conflict do nothing;

  return new;
end;
$$;

create function private.notify_admin_of_order_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.to_status = 'cancelled' then
    insert into public.admin_notifications (
      recipient_user_id, event_type, order_id, status_event_id
    )
    select role_row.user_id, 'order_cancelled', new.order_id, new.id
    from public.user_roles as role_row
    where role_row.role = 'admin'
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.notify_admin_of_new_order()
  from public, anon, authenticated, service_role;
revoke all on function private.notify_admin_of_order_cancellation()
  from public, anon, authenticated, service_role;

create trigger orders_create_admin_notification
  after insert on public.orders
  for each row execute function private.notify_admin_of_new_order();

create trigger order_status_events_notify_cancellation
  after insert on private.order_status_events
  for each row execute function private.notify_admin_of_order_cancellation();

commit;
