import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20261120000000_order_retention_deletion_redemption_ledger.sql", import.meta.url),
  "utf8",
);
const lower = migration.toLowerCase();

test("retention records terminal entry, preserves the first timestamp, and excludes active orders", () => {
  assert.match(migration, /retention_started_at timestamptz/i);
  assert.match(migration, /new\.order_status in \('delivered', 'cancelled'\)[\s\S]*?old\.order_status in \('delivered', 'cancelled'\)[\s\S]*?old\.retention_started_at is not null[\s\S]*?new\.retention_started_at := old\.retention_started_at/i);
  assert.match(migration, /else\s+new\.retention_started_at := pg_catalog\.clock_timestamp\(\)/i);
  assert.match(migration, /reopening a terminal order[\s\S]*?new\.retention_started_at := null/i);
});

test("legacy terminal rows receive a conservative migration-time floor without using created_at", () => {
  assert.match(migration, /greatest\([\s\S]*?coalesce\(order_row\.cancelled_at, order_row\.status_changed_at\)[\s\S]*?transaction_timestamp\(\)/i);
  const indexPosition = lower.indexOf("create index orders_terminal_retention_idx");
  const updatePosition = lower.indexOf("update public.orders as order_row");
  assert.ok(indexPosition >= 0 && updatePosition > indexPosition, "retention index must be created before the order backfill");
  const backfill = migration.match(/update public\.orders as order_row([\s\S]*?)create function private\.set_order_retention_started_at/i)?.[1] ?? "";
  assert.match(backfill, /order_status in \('delivered', 'cancelled'\)/i);
  assert.doesNotMatch(backfill, /created_at/i);
});

test("retention index keeps its partial predicate and follows the new column immediately", () => {
  const columnPosition = lower.indexOf("alter table public.orders add column retention_started_at timestamptz;");
  const indexPosition = lower.indexOf("create index orders_terminal_retention_idx");
  const updatePosition = lower.indexOf("update public.orders as order_row");
  assert.ok(indexPosition > columnPosition && updatePosition > indexPosition);
  const index = migration.match(/create index orders_terminal_retention_idx[\s\S]*?;/i)?.[0] ?? "";
  assert.match(index, /on public\.orders \(retention_started_at, id\)/i);
  assert.match(index, /where order_status in \('delivered', 'cancelled'\) and retention_started_at is not null/i);
});

test("order-item foreign-key DDL precedes order backfill trigger events", () => {
  const orderItemsAlter = lower.indexOf("alter table public.order_items");
  const backfill = lower.indexOf("update public.orders as order_row");
  assert.ok(orderItemsAlter >= 0 && orderItemsAlter < backfill,
    "order_items constraints referencing orders must be changed before updating orders");
  const block = migration.match(/alter table public\.order_items[\s\S]*?on delete cascade;/i)?.[0] ?? "";
  assert.match(block, /alter column product_id drop not null/i);
  assert.match(block, /foreign key \(product_id\) references public\.products \(id\) on delete set null/i);
  assert.match(block, /foreign key \(order_id\) references public\.orders \(id\) on delete cascade/i);
});

test("cleanup deletes only aged terminal orders with a bounded skip-locked batch", () => {
  assert.match(migration, /order_row\.order_status in \('delivered', 'cancelled'\)/i);
  assert.match(migration, /retention_started_at <= v_started_at - interval '45 days'/i);
  assert.match(migration, /for update of order_row skip locked\s+limit v_batch_limit/i);
  assert.match(migration, /v_batch_limit < 1 or v_batch_limit > 500/i);
});

test("cleanup retry is idempotent and successful and failed runs are observable", () => {
  assert.match(migration, /order_retention_cleanup_runs/i);
  assert.match(migration, /outcome text not null check \(outcome in \('succeeded', 'failed'\)\)/i);
  assert.match(migration, /get stacked diagnostics v_sqlstate = returned_sqlstate/i);
  assert.match(migration, /v_deleted_count := 0/i);
  assert.match(migration, /perform private\.hard_delete_order_rows\(v_order\.id\)/i);
});

test("manual deletion checks authenticated admin status and reports a safe result", () => {
  const fn = migration.match(/create function public\.delete_admin_order[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(fn, /auth\.uid\(\) is null or not coalesce\(private\.is_admin\(\), false\)/i);
  assert.match(fn, /for update/i);
  assert.match(fn, /returns table \(deleted boolean, order_number bigint\)/i);
  assert.match(migration, /revoke all on function public\.delete_admin_order\(uuid\)\s+from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.delete_admin_order\(uuid\) to authenticated/i);
});

test("order deletion removes restrictive order dependents before deleting the order", () => {
  const helper = migration.match(/create function private\.hard_delete_order_rows[\s\S]*?\$\$;/i)?.[0] ?? "";
  const dependentTables = [
    "public.admin_notifications",
    "public.email_deliveries",
    "private.admin_order_email_deliveries",
    "private.order_inventory_restorations",
    "private.cod_order_idempotency",
    "private.order_status_events",
  ];
  let previous = -1;
  for (const table of dependentTables) {
    const position = helper.indexOf("delete from " + table);
    assert.ok(position > previous, table + " must be deleted in FK-safe order");
    previous = position;
  }
  assert.ok(helper.indexOf("delete from public.orders") > previous);
  assert.doesNotMatch(helper, /customer_service_requests/i);
});

test("product deletion nulls only the live product reference and keeps item snapshots", () => {
  assert.match(migration, /alter column product_id drop not null[\s\S]*?foreign key \(product_id\) references public\.products \(id\) on delete set null/i);
  const guard = migration.match(/create or replace function private\.prevent_order_item_mutation[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(guard, /tg_op = 'UPDATE'[\s\S]*?pg_catalog\.pg_trigger_depth\(\) > 1[\s\S]*?old\.product_id is not null[\s\S]*?new\.product_id is null/i);
  for (const snapshot of ["product_name_snapshot", "product_slug_snapshot", "unit_price", "quantity", "line_total"]) {
    assert.match(guard, new RegExp(snapshot, "i"));
  }
});

test("order items cascade only with protected order deletion and remain immutable otherwise", () => {
  assert.match(migration, /foreign key \(order_id\) references public\.orders \(id\) on delete cascade/i);
  assert.match(migration, /tg_op = 'DELETE' and pg_catalog\.pg_trigger_depth\(\) > 1/i);
  assert.match(migration, /raise exception 'Order item snapshots are immutable'/i);
});

test("category restriction and product-owned inventory and image cascades are left unchanged", () => {
  assert.doesNotMatch(lower, /alter table public\.products[\s\S]{0,200}category_id/i);
  assert.doesNotMatch(lower, /drop constraint products_category_id_fkey/i);
  assert.doesNotMatch(lower, /drop constraint product_inventory_product_id_fkey|drop constraint product_images_product_id_fkey/i);
});

test("promotion ledger is private, PII-free, one-per-order, and preserves snapshots", () => {
  const table = migration.match(/create table private\.promotion_redemptions[\s\S]*?\n\);/i)?.[0] ?? "";
  assert.match(table, /order_id uuid unique references public\.orders \(id\) on delete set null/i);
  assert.match(table, /promotion_id uuid not null references public\.promotions \(id\) on delete restrict/i);
  for (const field of ["order_number_snapshot", "promotion_code_snapshot", "discount_amount", "currency", "status", "recorded_at", "qualified_at"]) {
    assert.match(table, new RegExp(field, "i"));
  }
  assert.doesNotMatch(table, /customer|email|phone|user_id/i);
  assert.match(table, /account_id uuid not null/i);
  assert.match(migration, /select order_row\.promotion_id, order_row\.id, order_row\.user_id, order_row\.order_number/i);
  assert.match(migration, /order_row\.promotion_id is not null and order_row\.user_id is null/i);
  assert.match(migration, /promotion_redemptions_account_capacity_idx[\s\S]*?\(promotion_id, account_id, status\)/i);
  assert.match(migration, /alter table private\.promotion_redemptions enable row level security/i);
  assert.match(migration, /revoke all privileges on table private\.promotion_redemptions\s+from public, anon, authenticated, service_role/i);
});

test("backfill and triggers record reservations once and classify delivered paid COD as redeemed", () => {
  assert.match(migration, /order_id uuid unique references public\.orders/i);
  assert.match(migration, /order_status = 'delivered'[\s\S]*?payment_method = 'cod'[\s\S]*?payment_status = 'paid' then 'redeemed'/i);
  assert.match(migration, /after insert on public\.orders[\s\S]*?execute function private\.record_order_promotion_redemption/i);
  assert.match(migration, /after update of order_status, payment_status on public\.orders[\s\S]*?execute function private\.update_order_promotion_redemption/i);
  assert.match(migration, /new\.payment_status = 'refunded' then 'refunded'/i);
});

test("global and per-account capacity use separate database-backed locks", () => {
  const guard = migration.match(/create function private\.enforce_promotion_redemption_capacity[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(guard, /security definer[\s\S]*?set search_path = ''/i);
  assert.match(guard, /new\.user_id is null[\s\S]*?errcode = '28000'/i);
  assert.match(guard, /from public\.promotions[\s\S]*?for share/i);
  assert.match(guard, /if v_maximum is not null[\s\S]*?promotion_redemption_global_locks[\s\S]*?for update/i);
  assert.match(guard, /if v_account_limit is not null[\s\S]*?promotion_redemption_account_locks[\s\S]*?for update/i);
  assert.match(guard, /redemption\.promotion_id = new\.promotion_id[\s\S]*?redemption\.status in \('reserved', 'redeemed', 'refunded'\)/i);
  assert.match(guard, /redemption\.account_id = new\.user_id[\s\S]*?redemption\.status in \('reserved', 'redeemed', 'refunded'\)/i);
  assert.match(guard, /per-account promotion redemption limit has been reached/i);
  assert.match(migration, /create table private\.promotion_redemption_global_locks[\s\S]*?promotion_id uuid primary key/i);
  assert.match(migration, /create table private\.promotion_redemption_account_locks[\s\S]*?primary key \(promotion_id, account_id\)/i);
  assert.match(migration, /revoke all privileges on table private\.promotion_redemption_global_locks,[\s\S]*?from public, anon, authenticated, service_role/i);
  assert.match(migration, /order_id uuid unique references public\.orders \(id\) on delete set null/i);
  assert.match(migration, /create trigger orders_enforce_promotion_redemption_capacity[\s\S]*?before insert on public\.orders/i);
});

test("checkout shares promotion configuration locks and preserves every other RPC behavior", () => {
  const latest = readFileSync(new URL("../supabase/migrations/20261112000000_checkout_discount_least_expression_fix.sql", import.meta.url), "utf8");
  const latestRpc = latest.match(/create or replace function public\.create_cod_order\([\s\S]*?\n\$\$;/i)?.[0] ?? "";
  const replacement = migration.match(/create or replace function public\.create_cod_order\([\s\S]*?\n\$\$;/i)?.[0] ?? "";
  assert.ok(latestRpc);
  assert.ok(replacement);
  const expected = latestRpc.replace(
    /(from public\.promotions as promotion\s+where pg_catalog\.lower\(promotion\.code\) = pg_catalog\.lower\(pg_catalog\.btrim\(p_promotion_code\)\)\s+)for update;/i,
    "$1for share;",
  );
  assert.equal(replacement, expected);
  assert.match(replacement, /security definer[\s\S]*?set search_path = ''/i);
  assert.doesNotMatch(migration, /grant execute on function public\.create_cod_order/i);
});

test("per-account limit defaults existing and new promotions to one and NULL means unlimited", () => {
  assert.match(migration, /add column per_account_redemption_limit integer default 1/i);
  assert.match(migration, /check \(per_account_redemption_limit is null or per_account_redemption_limit > 0\)/i);
  assert.match(migration, /NULL means unlimited/i);
  assert.match(migration, /promotion\.per_account_redemption_limit/i);
});

test("promotion order snapshots remain immutable through the existing attached trigger", () => {
  const initial = readFileSync(new URL("../supabase/migrations/20261021000000_initial_schema.sql", import.meta.url), "utf8");
  const gifts = readFileSync(new URL("../supabase/migrations/20261113000000_checkout_profile_gifts.sql", import.meta.url), "utf8");
  const guard = gifts.match(/create or replace function private\.prevent_order_snapshot_update[\s\S]*?\n\$\$;/i)?.[0] ?? "";
  for (const field of ["promotion_id", "promotion_code_snapshot", "discount_amount", "currency"]) {
    assert.match(guard, new RegExp(`new\\.${field}[\\s\\S]*?old\\.${field}`, "i"));
  }
  assert.match(initial, /create trigger orders_snapshot_immutable before update on public\.orders[\s\S]*?execute function private\.prevent_order_snapshot_update/i);
});

test("public promotion projections preserve their contracts and use ledger capacity", () => {
  const featured = migration.match(/create or replace function public\.get_public_featured_promotions[\s\S]*?\$\$;/i)?.[0] ?? "";
  const announcements = migration.match(/create or replace function public\.get_public_discount_announcements[\s\S]*?\$\$;/i)?.[0] ?? "";
  for (const fn of [featured, announcements]) {
    assert.match(fn, /security definer/i);
    assert.match(fn, /set search_path = ''/i);
    assert.match(fn, /private\.promotion_redemptions/i);
    assert.match(fn, /status in \('reserved', 'redeemed', 'refunded'\)/i);
    assert.doesNotMatch(fn, /public\.orders|customer_|order_number|user_id/i);
  }
  assert.match(migration, /grant execute on function public\.get_public_featured_promotions\(integer\) to anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.get_public_discount_announcements\(\) to anon, authenticated/i);
});

test("pg_cron is required and its named daily job is replaced idempotently", () => {
  assert.match(migration, /extension_row\.extname = 'pg_cron'/i);
  assert.match(migration, /Enable Supabase pg_cron before applying/i);
  assert.match(migration, /where job\.jobname = 'dr-beauty-order-retention-cleanup'/i);
  assert.match(migration, /perform cron\.unschedule\(v_job_id\)/i);
  assert.match(migration, /'0 3 \* \* \*'/i);
  assert.match(migration, /'select private\.run_order_retention_cleanup\(100\);'/i);
  assert.match(migration, /grant execute on function private\.run_order_retention_cleanup\(integer\) to postgres/i);
});
