import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("checkout preview checks global and account capacity but reports unavailable eligibility safely", async () => {
  const [actions, migration, phase1] = await Promise.all([
    read("../src/app/(checkout)/checkout/actions.js"),
    read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql"),
    read("../supabase/migrations/20261129000000_phase1_promotion_redemption_capacity_analytics_retention.sql"),
  ]);
  assert.match(actions, /select\("id,code,discount_type[\s\S]*?maximum_redemptions/);
  assert.match(actions, /rpc\([\s\S]*?get_promotion_preview_eligibility[\s\S]*?p_promotion_id: promotion\.id/);
  assert.match(actions, /!eligibility\.global_capacity_available[\s\S]*?total redemption limit/);
  assert.match(actions, /!eligibility\.account_capacity_available[\s\S]*?redemption limit for your account/);
  assert.match(actions, /eligibilityError \|\| typeof eligibility\?\.global_capacity_available !== "boolean"/);
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /redemption\.status in \('reserved', 'redeemed', 'refunded'\)/);
  assert.match(migration, /redemption\.account_id = v_account_id/);
  assert.match(migration, /grant execute on function public\.get_promotion_preview_eligibility\(uuid\)\s+to authenticated/);
  assert.match(migration, /revoke all on function public\.get_promotion_preview_eligibility\(uuid\)\s+from public, anon, authenticated, service_role/);
  assert.match(phase1, /public\.check_promotion_redemption_capacity\(uuid\)/);
});

test("preview remains advisory while the atomic order trigger is the concurrency-safe authority", async () => {
  const [action, form, finalRpc, ledger] = await Promise.all([
    read("../src/app/(checkout)/checkout/actions.js"),
    read("../src/app/(checkout)/checkout/CheckoutForm.jsx"),
    read("../supabase/migrations/20261120000000_order_retention_deletion_redemption_ledger.sql"),
    read("../supabase/migrations/20261129000000_phase1_promotion_redemption_capacity_analytics_retention.sql"),
  ]);
  assert.match(form, /Final eligibility and order totals are checked again when you place the order/);
  assert.match(action, /p_promotion_code:\s*promotionCode/);
  const guard = finalRpc.match(/create function private\.enforce_promotion_redemption_capacity\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(guard, /promotion_redemption_global_locks[\s\S]*?for update/);
  assert.match(guard, /promotion_redemption_account_locks[\s\S]*?for update/);
  assert.match(guard, /status in \('reserved', 'redeemed', 'refunded'\)/);
  assert.match(ledger, /language plpgsql[\s\S]*?security definer[\s\S]*?set search_path = ''/);
});

test("deleting retained orders releases only outstanding reservations and preserves ledger records", async () => {
  const [migration, retention] = await Promise.all([
    read("../supabase/migrations/20261129000000_phase1_promotion_redemption_capacity_analytics_retention.sql"),
    read("../supabase/migrations/20261120000000_order_retention_deletion_redemption_ledger.sql"),
  ]);
  assert.match(migration, /status in \('reserved', 'redeemed', 'cancelled', 'refunded', 'released'\)/);
  assert.match(migration, /where redemption\.order_id is null\s+and redemption\.status = 'reserved'/);
  assert.match(migration, /create trigger orders_release_reserved_promotion_redemption\s+before delete on public\.orders/);
  assert.match(migration, /set status = 'released',[\s\S]*?released_at = pg_catalog\.clock_timestamp\(\)[\s\S]*?redemption\.status = 'reserved'/);
  assert.match(migration, /released_at timestamptz/);
  assert.doesNotMatch(migration, /delete from private\.promotion_redemptions/i);
  assert.match(retention, /retention_started_at <= v_started_at - interval '45 days'/);
  assert.match(retention, /order_status in \('delivered', 'cancelled'\)/);
});

test("cancellation releases capacity, refunds retain existing counted behavior, and deletion only releases reservations", async () => {
  const [lifecycle, migration] = await Promise.all([
    read("../supabase/migrations/20261120000000_order_retention_deletion_redemption_ledger.sql"),
    read("../supabase/migrations/20261129000000_phase1_promotion_redemption_capacity_analytics_retention.sql"),
  ]);
  const updater = lifecycle.match(/create function private\.update_order_promotion_redemption\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(updater, /new\.order_status = 'cancelled' then 'cancelled'/);
  assert.match(updater, /new\.payment_status = 'refunded' then 'refunded'/);
  assert.match(migration, /redemption\.status = 'reserved'/);
  assert.doesNotMatch(migration, /set status = 'released'[\s\S]*?status in \('redeemed', 'refunded', 'cancelled'\)/);
});

test("admin analytics are admin-guarded and display per-status counts and account limits", async () => {
  const [migration, adminData, manager] = await Promise.all([
    read("../supabase/migrations/20261129000000_phase1_promotion_redemption_capacity_analytics_retention.sql"),
    read("../src/lib/admin.js"),
    read("../src/components/admin/AdminPromotionsManager.jsx"),
  ]);
  const analytics = migration.match(/create function public\.get_admin_promotion_redemption_counts\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(analytics, /auth\.uid\(\) is null or not coalesce\(private\.is_admin\(\), false\)/);
  for (const field of ["total_records", "capacity_count", "reserved_count", "redeemed_count", "cancelled_count", "refunded_count", "released_count"]) {
    assert.match(analytics, new RegExp(field));
  }
  assert.match(migration, /grant execute on function public\.get_admin_promotion_redemption_counts\(\)\s+to authenticated/);
  assert.match(adminData, /rpc\("get_admin_promotion_redemption_counts"\)/);
  assert.match(adminData, /redemption_counts:/);
  assert.match(manager, /Records:[\s\S]*capacity counted:[\s\S]*Reserved[\s\S]*Redeemed[\s\S]*Cancelled[\s\S]*Refunded[\s\S]*Released/);
  assert.match(manager, /promotion\.per_account_redemption_limit == null \? "Unlimited per account"/);
});
