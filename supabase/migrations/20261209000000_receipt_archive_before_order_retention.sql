begin;

-- Durable, immutable business snapshots are independent of operational order
-- rows. No order/customer/product foreign keys are used in this archive.
create table private.receipt_archive (
  archive_id uuid primary key default pg_catalog.gen_random_uuid(),
  original_order_id uuid not null unique,
  original_order_number bigint not null unique,
  archived_at timestamptz not null default pg_catalog.clock_timestamp(),
  archive_source text not null check (archive_source in ('retention', 'admin_delete')),
  archived_by uuid,
  snapshot_version smallint not null default 1 check (snapshot_version = 1),
  snapshot jsonb not null check (pg_catalog.jsonb_typeof(snapshot) = 'object')
);
create index receipt_archive_archived_order_idx
  on private.receipt_archive (archived_at, original_order_number);
alter table private.receipt_archive enable row level security;
revoke all privileges on table private.receipt_archive from public, anon, authenticated, service_role;

create table private.receipt_archive_failures (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  original_order_id uuid not null,
  original_order_number bigint,
  attempted_at timestamptz not null default pg_catalog.clock_timestamp(),
  attempt_source text not null check (attempt_source in ('retention', 'admin_delete')),
  sqlstate text not null check (sqlstate ~ '^[0-9A-Z]{5}$')
);
create index receipt_archive_failures_recent_idx
  on private.receipt_archive_failures (attempted_at desc);
alter table private.receipt_archive_failures enable row level security;
revoke all privileges on table private.receipt_archive_failures from public, anon, authenticated, service_role;

create table private.receipt_archive_exports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  admin_id uuid,
  export_mode text not null check (export_mode in ('incremental', 'complete')),
  started_at timestamptz not null default pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  from_archived_at timestamptz,
  through_archived_at timestamptz not null,
  range_started_at timestamptz,
  range_ended_at timestamptz,
  record_count integer not null default 0 check (record_count >= 0),
  result text not null default 'started' check (result in ('started', 'succeeded', 'failed')),
  sqlstate text check (sqlstate is null or sqlstate ~ '^[0-9A-Z]{5}$'),
  check ((result = 'started' and completed_at is null) or (result <> 'started' and completed_at is not null)),
  check ((result = 'failed') = (sqlstate is not null))
);
create index receipt_archive_exports_recent_idx
  on private.receipt_archive_exports (started_at desc);
alter table private.receipt_archive_exports enable row level security;
revoke all privileges on table private.receipt_archive_exports from public, anon, authenticated, service_role;

-- Track the exact archive rows read by each export. An incremental export only
-- treats rows from a successful incremental export as covered, so a row that
-- commits during a paginated download remains eligible for the next download.
create table private.receipt_archive_export_items (
  export_id uuid not null references private.receipt_archive_exports(id) on delete cascade,
  original_order_id uuid not null,
  original_order_number bigint not null,
  primary key (export_id, original_order_id)
);
create index receipt_archive_export_items_order_idx
  on private.receipt_archive_export_items (original_order_id, export_id);
alter table private.receipt_archive_export_items enable row level security;
revoke all privileges on table private.receipt_archive_export_items from public, anon, authenticated, service_role;

-- Admin export reminders begin on migration installation. This cadence is an
-- operational reminder, not a statutory retention period; only postgres can
-- change the interval after professional review.
create table private.receipt_archive_settings (
  singleton boolean primary key default true check (singleton),
  installed_at timestamptz not null default pg_catalog.clock_timestamp(),
  export_interval_days integer not null default 45 check (export_interval_days between 1 and 3650)
);
insert into private.receipt_archive_settings (singleton) values (true)
on conflict (singleton) do nothing;
alter table private.receipt_archive_settings enable row level security;
revoke all privileges on table private.receipt_archive_settings from public, anon, authenticated, service_role;

create function private.prevent_receipt_archive_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Receipt archive records are immutable' using errcode = '23514';
end;
$$;
alter function private.prevent_receipt_archive_mutation() owner to postgres;
revoke all on function private.prevent_receipt_archive_mutation() from public, anon, authenticated, service_role;
create trigger receipt_archive_immutable
  before update or delete on private.receipt_archive
  for each row execute function private.prevent_receipt_archive_mutation();

create function private.archive_order_snapshot(p_order_id uuid, p_archive_source text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_snapshot jsonb;
  v_archive_id uuid;
  v_existing_snapshot jsonb;
  v_item_count integer;
begin
  if p_order_id is null or p_archive_source not in ('retention', 'admin_delete') then
    raise exception using errcode = '22023', message = 'The receipt archive request is invalid.';
  end if;

  select order_row.* into v_order
  from public.orders as order_row
  where order_row.id = p_order_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The order was not found for archival.';
  end if;

  -- Aggregate in a separate query to preserve item ordering in the JSON array.
  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', item.id,
      'product_id', item.product_id,
      'product_name', item.product_name_snapshot,
      'product_slug', item.product_slug_snapshot,
      'quantity', item.quantity,
      'unit_price', item.unit_price::text,
      'line_total', item.line_total::text,
      'promotion_discount_amount', item.promotion_discount_amount::text,
      'created_at', item.created_at
    ) order by item.created_at, item.id),
    '[]'::jsonb
  ), pg_catalog.count(*)::integer
  into v_snapshot, v_item_count
  from public.order_items as item
  where item.order_id = v_order.id;

  v_snapshot := pg_catalog.jsonb_build_object(
    'snapshot_version', 1,
    'internal_archive_reference', 'ARCHIVE-' || v_order.order_number::text,
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'customer_name', v_order.customer_name,
    'customer_email', v_order.customer_email,
    'customer_phone', v_order.customer_phone,
    'additional_phone', v_order.additional_phone,
    'governorate', v_order.governorate,
    'city', v_order.city,
    'address_line', v_order.address_line,
    'delivery_notes', v_order.delivery_notes,
    'promotion_code', v_order.promotion_code_snapshot,
    'promotion_id', v_order.promotion_id,
    'payment_method', v_order.payment_method,
    'payment_status', v_order.payment_status,
    'order_status', v_order.order_status,
    'subtotal', v_order.subtotal::text,
    'discount_amount', v_order.discount_amount::text,
    'shipping_amount', v_order.shipping_amount::text,
    'shipping_fee_amount', v_order.shipping_fee_amount::text,
    'shipping_discount_amount', v_order.shipping_discount_amount::text,
    'gift_packaging_fee_amount', v_order.gift_packaging_fee_amount::text,
    'total_amount', v_order.total_amount::text,
    'currency', v_order.currency,
    'is_gift', v_order.is_gift,
    'gift_recipient_name', v_order.gift_recipient_name,
    'gift_recipient_phone', v_order.gift_recipient_phone,
    'gift_message', v_order.gift_message,
    'gift_packaging_selected', v_order.gift_packaging_selected,
    'created_at', v_order.created_at,
    'updated_at', v_order.updated_at,
    'status_changed_at', v_order.status_changed_at,
    'shipped_at', v_order.shipped_at,
    'cancelled_at', v_order.cancelled_at,
    'delivered_at', (
      select event.changed_at
      from private.order_status_events as event
      where event.order_id = v_order.id and event.to_status = 'delivered'
      order by event.changed_at desc
      limit 1
    ),
    'status_history', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'from_status', event.from_status,
          'to_status', event.to_status,
          'changed_at', event.changed_at,
          'shipping_carrier', event.shipping_carrier,
          'tracking_number', event.tracking_number,
          'tracking_url', event.tracking_url
        ) order by event.changed_at, event.id),
        '[]'::jsonb
      )
      from private.order_status_events as event
      where event.order_id = v_order.id
    ),
    'retention_started_at', v_order.retention_started_at,
    'inventory_restored_at', v_order.inventory_restored_at,
    'shipping_carrier', v_order.shipping_carrier,
    'tracking_number', v_order.tracking_number,
    'tracking_url', v_order.tracking_url,
    'item_count', v_item_count,
    'items', v_snapshot
  );

  insert into private.receipt_archive (
    original_order_id, original_order_number, archive_source, archived_by,
    snapshot_version, snapshot
  ) values (
    v_order.id, v_order.order_number, p_archive_source, auth.uid(), 1, v_snapshot
  ) on conflict (original_order_id) do nothing
  returning archive_id into v_archive_id;

  select archive.archive_id, archive.snapshot
    into v_archive_id, v_existing_snapshot
  from private.receipt_archive as archive
  where archive.original_order_id = v_order.id;
  if not found or v_existing_snapshot is distinct from v_snapshot then
    raise exception using errcode = '23514', message = 'The saved receipt snapshot differs from the order being deleted.';
  end if;

  if v_archive_id is null
     or pg_catalog.jsonb_typeof(v_snapshot -> 'items') <> 'array'
     or pg_catalog.jsonb_array_length(v_snapshot -> 'items') <> v_item_count
     or v_snapshot ->> 'order_number' <> v_order.order_number::text
     or (v_snapshot ->> 'total_amount')::numeric <> v_order.total_amount then
    raise exception using errcode = '23514', message = 'The receipt snapshot could not be verified.';
  end if;

  return v_archive_id;
end;
$$;
alter function private.archive_order_snapshot(uuid, text) owner to postgres;
revoke all on function private.archive_order_snapshot(uuid, text) from public, anon, authenticated, service_role;

-- Every operational hard-delete route passes through this archive gate.
create or replace function private.hard_delete_order_rows(p_order_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  begin
    perform private.archive_order_snapshot(p_order_id, 'admin_delete');
  exception when others then
    raise exception using errcode = 'P0001', message = 'Receipt archival failed verification; order deletion was blocked.';
  end;

  delete from public.admin_notifications as notification where notification.order_id = p_order_id;
  delete from public.email_deliveries as delivery where delivery.order_id = p_order_id;
  delete from private.admin_order_email_deliveries as delivery where delivery.order_id = p_order_id;
  delete from private.order_inventory_restorations as restoration where restoration.order_id = p_order_id;
  delete from private.cod_order_idempotency as binding where binding.order_id = p_order_id;
  delete from private.order_status_events as event where event.order_id = p_order_id;
  delete from public.orders as order_row where order_row.id = p_order_id;
end;
$$;
alter function private.hard_delete_order_rows(uuid) owner to postgres;
revoke all on function private.hard_delete_order_rows(uuid) from public, anon, authenticated, service_role;

create function public.delete_admin_order_with_archive(p_order_id uuid)
returns table (deleted boolean, order_number bigint, blocked_by_archive boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_number bigint;
  v_account_id uuid;
  v_locked_account_id uuid;
  v_failure_sqlstate text;
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_order_id is null then
    raise exception using errcode = '22023', message = 'The order identifier is invalid.';
  end if;

  select order_row.user_id into v_account_id from public.orders as order_row where order_row.id = p_order_id;
  if not found then raise exception using errcode = 'P0002', message = 'The order was not found.'; end if;
  if v_account_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_account_id::text || ':promotion-first-purchase', 0)
    );
  end if;
  select order_row.order_number, order_row.user_id into v_order_number, v_locked_account_id
  from public.orders as order_row where order_row.id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'The order was not found.'; end if;
  if v_locked_account_id is distinct from v_account_id then
    raise exception using errcode = '40001', message = 'The order account changed; retry the deletion.';
  end if;

  begin
    perform private.hard_delete_order_rows(p_order_id);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_failure_sqlstate = returned_sqlstate;
    insert into private.receipt_archive_failures (
      original_order_id, original_order_number, attempt_source, sqlstate
    ) values (p_order_id, v_order_number, 'admin_delete', v_failure_sqlstate);
    return query select false, v_order_number, true;
    return;
  end;
  return query select true, v_order_number, false;
end;
$$;
alter function public.delete_admin_order_with_archive(uuid) owner to postgres;
revoke all on function public.delete_admin_order_with_archive(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_admin_order_with_archive(uuid) to authenticated;

-- Preserve the old RPC contract for direct, already-deployed callers. It still
-- passes through hard_delete_order_rows and therefore cannot bypass archiving.
create or replace function public.delete_admin_order(p_order_id uuid)
returns table (deleted boolean, order_number bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result record;
begin
  select * into v_result from public.delete_admin_order_with_archive(p_order_id);
  deleted := v_result.deleted;
  order_number := v_result.order_number;
  return next;
end;
$$;
alter function public.delete_admin_order(uuid) owner to postgres;
revoke all on function public.delete_admin_order(uuid) from public, anon, authenticated, service_role;
grant execute on function public.delete_admin_order(uuid) to authenticated;

-- Retry archival and deletion on each existing daily 03:00 retention run.
create or replace function private.run_order_retention_cleanup(p_batch_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_started_at timestamptz := pg_catalog.clock_timestamp();
  v_run_id uuid := pg_catalog.gen_random_uuid();
  v_batch_limit integer := coalesce(p_batch_limit, 100);
  v_deleted_count integer := 0;
  v_blocked_count integer := 0;
  v_failure_count integer := 0;
  v_sqlstate text;
  v_candidate record;
  v_locked_order_number bigint;
begin
  if v_batch_limit < 1 or v_batch_limit > 500 then
    raise exception using errcode = '22023', message = 'The retention batch limit is invalid.';
  end if;

  begin
    for v_candidate in
      select order_row.id, order_row.user_id
      from public.orders as order_row
      where order_row.order_status in ('delivered', 'cancelled')
        and order_row.retention_started_at <= v_started_at - interval '45 days'
      order by order_row.user_id nulls first, order_row.retention_started_at, order_row.id
      limit v_batch_limit
    loop
      if v_candidate.user_id is not null then
        perform pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(v_candidate.user_id::text || ':promotion-first-purchase', 0)
        );
      end if;

      v_locked_order_number := null;
      select order_row.order_number into v_locked_order_number
      from public.orders as order_row
      where order_row.id = v_candidate.id
        and order_row.order_status in ('delivered', 'cancelled')
        and order_row.retention_started_at <= v_started_at - interval '45 days'
      for update of order_row skip locked;
      if v_locked_order_number is null then continue; end if;

      begin
        perform private.archive_order_snapshot(v_candidate.id, 'retention');
        perform private.hard_delete_order_rows(v_candidate.id);
        v_deleted_count := v_deleted_count + 1;
      exception when sqlstate 'P0001' then
        get stacked diagnostics v_sqlstate = returned_sqlstate;
        insert into private.receipt_archive_failures (
          original_order_id, original_order_number, attempt_source, sqlstate
        ) values (v_candidate.id, v_locked_order_number, 'retention', v_sqlstate);
        v_blocked_count := v_blocked_count + 1;
        v_failure_count := v_failure_count + 1;
      end;
    end loop;
  exception when others then
    get stacked diagnostics v_sqlstate = returned_sqlstate;
    insert into private.order_retention_cleanup_runs (
      id, started_at, completed_at, batch_limit, deleted_count, outcome, sqlstate
    ) values (
      v_run_id, v_started_at, pg_catalog.clock_timestamp(), v_batch_limit, v_deleted_count, 'failed', v_sqlstate
    );
    return pg_catalog.jsonb_build_object(
      'run_id', v_run_id, 'outcome', 'failed', 'deleted_count', v_deleted_count,
      'blocked_count', v_blocked_count, 'sqlstate', v_sqlstate
    );
  end;

  insert into private.order_retention_cleanup_runs (
    id, started_at, completed_at, batch_limit, deleted_count, outcome, sqlstate
  ) values (
    v_run_id, v_started_at, pg_catalog.clock_timestamp(), v_batch_limit, v_deleted_count,
    case when v_failure_count = 0 then 'succeeded' else 'failed' end,
    case when v_failure_count = 0 then null else 'P0001' end
  );
  return pg_catalog.jsonb_build_object(
    'run_id', v_run_id,
    'outcome', case when v_failure_count = 0 then 'succeeded' else 'failed' end,
    'deleted_count', v_deleted_count,
    'blocked_count', v_blocked_count,
    'failed_archive_attempts', v_failure_count
  );
end;
$$;
alter function private.run_order_retention_cleanup(integer) owner to postgres;
revoke all on function private.run_order_retention_cleanup(integer) from public, anon, authenticated, service_role;
grant execute on function private.run_order_retention_cleanup(integer) to postgres;

create function public.admin_receipt_archive_overview()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  with latest_export as (
    select export.completed_at
    from private.receipt_archive_exports as export
    where export.result = 'succeeded'
    order by export.completed_at desc
    limit 1
  ), due as (
    select pg_catalog.count(*)::integer as count,
           pg_catalog.count(*) filter (
             where order_row.retention_started_at + interval '45 days' <= pg_catalog.clock_timestamp()
           )::integer as blocked,
           min(order_row.retention_started_at + interval '45 days') as next_due
    from public.orders as order_row
    where order_row.order_status in ('delivered', 'cancelled')
      and order_row.retention_started_at is not null
      and not exists (
        select 1 from private.receipt_archive as archive
        where archive.original_order_id = order_row.id
      )
  ), settings as (
    select setting.installed_at, setting.export_interval_days
    from private.receipt_archive_settings as setting where setting.singleton
  )
  select pg_catalog.jsonb_build_object(
    'archive_count', (select pg_catalog.count(*)::integer from private.receipt_archive),
    'last_archived_at', (select max(archive.archived_at) from private.receipt_archive as archive),
    'awaiting_count', due.count,
    'next_order_archive_at', due.next_due,
    'failed_attempt_count', (select pg_catalog.count(*)::integer from private.receipt_archive_failures),
    'unresolved_failure_count', (
      select pg_catalog.count(*)::integer
      from private.receipt_archive_failures as failure
      where not exists (
        select 1 from private.receipt_archive as archive
        where archive.original_order_id = failure.original_order_id
      )
    ),
    'deletion_blocked_count', due.blocked,
    'export_reminder_overdue', pg_catalog.clock_timestamp() >= coalesce((select latest_export.completed_at from latest_export), settings.installed_at)
      + settings.export_interval_days * interval '1 day',
    'order_archive_overdue', due.blocked > 0,
    'last_export_at', (select latest_export.completed_at from latest_export),
    'next_export_at', coalesce((select latest_export.completed_at from latest_export), settings.installed_at)
      + settings.export_interval_days * interval '1 day',
    'export_interval_days', settings.export_interval_days,
    'next_expected_archive_at', least(
      due.next_due,
      coalesce((select latest_export.completed_at from latest_export), settings.installed_at)
        + settings.export_interval_days * interval '1 day'
    ),
    'overdue', due.blocked > 0 or pg_catalog.clock_timestamp() >= coalesce((select latest_export.completed_at from latest_export), settings.installed_at)
      + settings.export_interval_days * interval '1 day',
    'due_soon', (
      due.next_due is not null
      and due.next_due > pg_catalog.clock_timestamp()
      and due.next_due <= pg_catalog.clock_timestamp() + interval '7 days'
    ) or (
      coalesce((select latest_export.completed_at from latest_export), settings.installed_at)
        + settings.export_interval_days * interval '1 day' > pg_catalog.clock_timestamp()
      and coalesce((select latest_export.completed_at from latest_export), settings.installed_at)
        + settings.export_interval_days * interval '1 day' <= pg_catalog.clock_timestamp() + interval '7 days'
    )
  ) into v_result
  from due cross join settings;
  return v_result;
end;
$$;
alter function public.admin_receipt_archive_overview() owner to postgres;
revoke all on function public.admin_receipt_archive_overview() from public, anon, authenticated, service_role;
grant execute on function public.admin_receipt_archive_overview() to authenticated;

create function public.begin_admin_receipt_archive_export(p_export_mode text)
returns table (export_id uuid, from_archived_at timestamptz, through_archived_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_export_id uuid := pg_catalog.gen_random_uuid();
  v_from timestamptz;
  v_through timestamptz := pg_catalog.clock_timestamp();
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_export_mode is null or p_export_mode not in ('incremental', 'complete') then
    raise exception using errcode = '22023', message = 'The archive export mode is invalid.';
  end if;
  if p_export_mode = 'incremental' then
    select max(export.through_archived_at) into v_from
    from private.receipt_archive_exports as export
    where export.export_mode = 'incremental' and export.result = 'succeeded';
  end if;
  insert into private.receipt_archive_exports (
    id, admin_id, export_mode, from_archived_at, through_archived_at
  ) values (v_export_id, auth.uid(), p_export_mode, v_from, v_through);
  -- Freeze membership at export start. Rows committed later are intentionally
  -- left for the next incremental export (and appear in a later complete one).
  insert into private.receipt_archive_export_items (export_id, original_order_id, original_order_number)
  select v_export_id, archive.original_order_id, archive.original_order_number
  from private.receipt_archive as archive
  where p_export_mode = 'complete'
     or not exists (
       select 1
       from private.receipt_archive_export_items as previous_item
       join private.receipt_archive_exports as previous_export on previous_export.id = previous_item.export_id
       where previous_item.original_order_id = archive.original_order_id
         and previous_export.export_mode = 'incremental'
         and previous_export.result = 'succeeded'
     );
  return query select v_export_id, v_from, v_through;
end;
$$;
alter function public.begin_admin_receipt_archive_export(text) owner to postgres;
revoke all on function public.begin_admin_receipt_archive_export(text) from public, anon, authenticated, service_role;
grant execute on function public.begin_admin_receipt_archive_export(text) to authenticated;

create function public.get_admin_receipt_archive_export_page(p_export_id uuid, p_after_order_number bigint default 0, p_limit integer default 500)
returns table (archive_id uuid, archive_source text, snapshot_version smallint, original_order_number bigint, archived_at timestamptz, snapshot jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_export private.receipt_archive_exports%rowtype;
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_export_id is null or p_after_order_number is null or p_after_order_number < 0
     or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'The archive page size is invalid.';
  end if;
  select export.* into v_export
  from private.receipt_archive_exports as export
  where export.id = p_export_id and export.admin_id = auth.uid() and export.result = 'started';
  if not found then raise exception using errcode = '42501', message = 'The archive export is unavailable.'; end if;

  return query
  select archive.archive_id, archive.archive_source, archive.snapshot_version,
         archive.original_order_number, archive.archived_at, archive.snapshot
  from private.receipt_archive_export_items as export_item
  join private.receipt_archive as archive on archive.original_order_id = export_item.original_order_id
  where export_item.export_id = v_export.id
    and export_item.original_order_number > coalesce(p_after_order_number, 0)
  order by export_item.original_order_number
  limit p_limit;
end;
$$;
alter function public.get_admin_receipt_archive_export_page(uuid, bigint, integer) owner to postgres;
revoke all on function public.get_admin_receipt_archive_export_page(uuid, bigint, integer) from public, anon, authenticated, service_role;
grant execute on function public.get_admin_receipt_archive_export_page(uuid, bigint, integer) to authenticated;

create function public.finish_admin_receipt_archive_export(
  p_export_id uuid, p_success boolean, p_record_count integer,
  p_range_started_at timestamptz default null, p_range_ended_at timestamptz default null,
  p_sqlstate text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staged_count integer;
  v_staged_from timestamptz;
  v_staged_through timestamptz;
begin
  if auth.uid() is null or not coalesce(private.is_admin(), false) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_export_id is null or p_success is null or p_record_count is null or p_record_count < 0
     or (not p_success and (p_sqlstate is null or p_sqlstate !~ '^[0-9A-Z]{5}$'))
     or (p_success and p_sqlstate is not null)
     or ((p_range_started_at is null) <> (p_range_ended_at is null))
     or (p_range_started_at is not null and p_range_ended_at < p_range_started_at) then
    raise exception using errcode = '22023', message = 'The archive export result is invalid.';
  end if;
  if p_success then
    select pg_catalog.count(*)::integer, min(archive.archived_at), max(archive.archived_at)
      into v_staged_count, v_staged_from, v_staged_through
    from private.receipt_archive_export_items as export_item
    join private.receipt_archive as archive on archive.original_order_id = export_item.original_order_id
    where export_item.export_id = p_export_id;
    if v_staged_count is distinct from p_record_count
       or v_staged_from is distinct from p_range_started_at
       or v_staged_through is distinct from p_range_ended_at then
      raise exception using errcode = '22023', message = 'The archive export record count or date range does not match its staged rows.';
    end if;
  end if;
  update private.receipt_archive_exports as export
  set completed_at = pg_catalog.clock_timestamp(),
      record_count = p_record_count,
      range_started_at = p_range_started_at,
      range_ended_at = p_range_ended_at,
      result = case when p_success then 'succeeded' else 'failed' end,
      sqlstate = case when p_success then null else p_sqlstate end
  where export.id = p_export_id and export.admin_id = auth.uid() and export.result = 'started';
  if found and not p_success then
    delete from private.receipt_archive_export_items as export_item where export_item.export_id = p_export_id;
  end if;
  return found;
end;
$$;
alter function public.finish_admin_receipt_archive_export(uuid, boolean, integer, timestamptz, timestamptz, text) owner to postgres;
revoke all on function public.finish_admin_receipt_archive_export(uuid, boolean, integer, timestamptz, timestamptz, text) from public, anon, authenticated, service_role;
grant execute on function public.finish_admin_receipt_archive_export(uuid, boolean, integer, timestamptz, timestamptz, text) to authenticated;

commit;
