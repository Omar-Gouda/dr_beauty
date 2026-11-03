import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20261117000000_outstanding_cod_order_limit.sql",
  import.meta.url,
);
const checkoutActionPath = new URL("../src/app/(checkout)/checkout/actions.js", import.meta.url);
const latestOrderRpcPath = new URL(
  "../supabase/migrations/20261112000000_checkout_discount_least_expression_fix.sql",
  import.meta.url,
);

test("outstanding COD order guard is private, configurable, and counts only unresolved COD states", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const fn = migration.match(/create function private\.enforce_outstanding_cod_order_limit\(\)[\s\S]*?\n\$\$;/i)?.[0];

  assert.ok(fn, "expected database insert guard");
  assert.match(migration, /max_outstanding_cod_orders integer not null default 3/i);
  assert.match(migration, /alter table private\.cod_order_limit_settings enable row level security/i);
  assert.match(migration, /revoke all on table private\.cod_order_limit_settings\s+from public, anon, authenticated, service_role/i);
  assert.match(fn, /security definer/i);
  assert.match(fn, /volatile/i);
  assert.match(fn, /set search_path\s*=\s*''/i);
  assert.match(fn, /pg_catalog\.pg_advisory_xact_lock\s*\([\s\S]*?new\.user_id::text/i);
  assert.match(fn, /where existing_order\.user_id\s*=\s*new\.user_id/i);
  assert.match(fn, /existing_order\.payment_method\s*=\s*'cod'/i);
  assert.match(fn, /existing_order\.order_status in\s*\('pending_confirmation', 'confirmed', 'processing', 'shipped'\)/i);
  assert.doesNotMatch(fn, /'delivered'|'cancelled'/i);
  assert.match(fn, /errcode\s*=\s*'PZ001'/i);
  assert.match(migration, /before insert on public\.orders/i);
  assert.match(migration, /revoke all on function private\.enforce_outstanding_cod_order_limit\(\)\s+from public, anon, authenticated, service_role/i);
});

test("guard runs only for new rows, so existing idempotent retries remain intact", async () => {
  const [migration, rpc] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(latestOrderRpcPath, "utf8"),
  ]);

  assert.doesNotMatch(migration, /create or replace function public\.create_cod_order/i);
  assert.doesNotMatch(migration, /private\.cod_order_idempotency/i);
  const retryLookup = rpc.indexOf("from private.cod_order_idempotency as binding");
  const retryReturn = rpc.indexOf("return next;", retryLookup);
  const firstOrderInsert = rpc.indexOf("insert into public.orders as created_order");
  assert.ok(retryLookup >= 0 && retryReturn > retryLookup && firstOrderInsert > retryReturn);
});

test("count predicate includes only this customer's outstanding COD orders", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const fn = migration.match(/create function private\.enforce_outstanding_cod_order_limit\(\)[\s\S]*?\n\$\$;/i)?.[0];
  const statusClause = fn?.match(/existing_order\.order_status in\s*\(([^)]*)\)/i)?.[1];
  assert.ok(statusClause, "expected explicit outstanding status allowlist");
  const outstandingStatuses = new Set([...statusClause.matchAll(/'([^']+)'/g)].map((match) => match[1]));
  const orders = [
    { user_id: "customer-a", payment_method: "cod", order_status: "pending_confirmation" },
    { user_id: "customer-a", payment_method: "cod", order_status: "confirmed" },
    { user_id: "customer-a", payment_method: "cod", order_status: "processing" },
    { user_id: "customer-a", payment_method: "cod", order_status: "shipped" },
    { user_id: "customer-a", payment_method: "cod", order_status: "cancelled" },
    { user_id: "customer-a", payment_method: "cod", order_status: "delivered" },
    { user_id: "customer-b", payment_method: "cod", order_status: "pending_confirmation" },
    { user_id: "customer-a", payment_method: "card", order_status: "pending_confirmation" },
  ];
  const counted = orders.filter((order) => order.user_id === "customer-a"
    && order.payment_method === "cod"
    && outstandingStatuses.has(order.order_status));

  assert.equal(counted.length, 4);
  assert.equal(outstandingStatuses.has("cancelled"), false);
  assert.equal(outstandingStatuses.has("delivered"), false);
});

test("different-key attempts serialize before the count query", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const fn = migration.match(/create function private\.enforce_outstanding_cod_order_limit\(\)[\s\S]*?\n\$\$;/i)?.[0];
  const lock = fn?.indexOf("pg_catalog.pg_advisory_xact_lock");
  const count = fn?.indexOf("select pg_catalog.count(*)");

  assert.ok(lock >= 0 && count > lock);
  assert.match(fn, /volatile/i);
  assert.match(fn, /pg_catalog\.hashtextextended\('outstanding-cod-orders:'\s*\|\|\s*new\.user_id::text/i);
});

test("checkout maps the dedicated limit SQLSTATE to a safe customer message", async () => {
  const action = await readFile(checkoutActionPath, "utf8");
  assert.match(action, /error\?\.code === "PZ001"[\s\S]*outstanding_order_limit/);
  assert.match(action, /if \(error\?\.code === "PZ001"\)\s*\{\s*return "You have reached the limit of open cash-on-delivery orders\./);
});

test("customer identity is supplied by the authenticated RPC path, not a checkout input", async () => {
  const [action, rpc] = await Promise.all([
    readFile(checkoutActionPath, "utf8"),
    readFile(latestOrderRpcPath, "utf8"),
  ]);
  const rpcCall = action.slice(action.indexOf('supabase.rpc("create_cod_order_with_whatsapp_consent"'));
  assert.doesNotMatch(rpcCall.slice(0, rpcCall.indexOf("}));")), /p_user_id|p_customer_id/);
  assert.match(rpc, /v_user_id := auth\.uid\(\)/i);
});
