import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  countPromotionStatuses,
  filterAdminPromotions,
  getPromotionCapacity,
  getPromotionLifecycleStatus,
  getPromotionTargetSummary,
} from "../src/lib/admin-promotions.mjs";

const manager = await readFile(new URL("../src/components/admin/AdminPromotionsManager.jsx", import.meta.url), "utf8");
const adminData = await readFile(new URL("../src/lib/admin.js", import.meta.url), "utf8");
const phase1 = await readFile(new URL("../supabase/migrations/20261129000000_phase1_promotion_redemption_capacity_analytics_retention.sql", import.meta.url), "utf8");

const now = Date.parse("2030-01-01T00:00:00.000Z");
const promotions = [
  { id: "a", code: "NOW", is_active: true, starts_at: null, ends_at: "2030-02-01T00:00:00Z", application_scope: "order" },
  { id: "b", code: "NEXT", is_active: true, starts_at: "2030-01-02T00:00:00Z", ends_at: null, application_scope: "products", product_target_ids: ["p1"] },
  { id: "c", code: "OLD", is_active: true, starts_at: null, ends_at: "2029-12-31T23:59:59Z", application_scope: "categories" },
  { id: "d", code: "OFF", is_active: false, starts_at: null, ends_at: null, application_scope: "order" },
];

test("overview separates active, scheduled, expired, and disabled promotions by schedule and enabled state", () => {
  assert.equal(getPromotionLifecycleStatus(promotions[0], now), "active");
  assert.equal(getPromotionLifecycleStatus(promotions[1], now), "scheduled");
  assert.equal(getPromotionLifecycleStatus(promotions[2], now), "expired");
  assert.equal(getPromotionLifecycleStatus(promotions[3], now), "disabled");
  assert.deepEqual(countPromotionStatuses(promotions, now), { active: 1, scheduled: 1, expired: 1, disabled: 1 });
});

test("search and status filters work together and include resolved target names", () => {
  const targetSummary = getPromotionTargetSummary(promotions[1], [{ id: "p1", name: "Rose Serum" }], []);
  assert.equal(targetSummary, "Products: Rose Serum");
  const targets = { b: targetSummary };
  assert.deepEqual(filterAdminPromotions(promotions, { status: "scheduled", search: "rose" }, now, targets).map((item) => item.code), ["NEXT"]);
  assert.deepEqual(filterAdminPromotions(promotions, { status: "disabled", search: "next" }, now, targets), []);
  assert.equal(getPromotionTargetSummary({ application_scope: "product_and_category", product_target_ids: ["p1"], category_target_ids: ["c1"] }, [{ id: "p1", name: "Rose Serum" }], [{ id: "c1", name: "Face Care" }]), "Products or categories: Rose Serum / Face Care");
});

test("capacity summary reports remaining uses and utilization without leaking account data", () => {
  assert.deepEqual(getPromotionCapacity({ maximum_redemptions: 20, redemption_counts: { capacity_count: 7 } }), {
    limit: 20, used: 7, remaining: 13, utilizationPercent: 35,
  });
  assert.deepEqual(getPromotionCapacity({ maximum_redemptions: 2, redemption_counts: { capacity_count: 4 } }), {
    limit: 2, used: 4, remaining: 0, utilizationPercent: 100,
  });
  assert.equal(getPromotionCapacity({ maximum_redemptions: null, redemption_counts: { capacity_count: 7 } }).remaining, null);
});

test("overview reuses Phase 1 aggregate analytics and presents statuses, tiering, targets, and redemption limits", () => {
  assert.match(phase1, /create function public\.get_admin_promotion_redemption_counts\(\)/);
  for (const count of ["total_records", "capacity_count", "reserved_count", "redeemed_count", "cancelled_count", "refunded_count", "released_count"]) {
    assert.match(phase1, new RegExp(count));
  }
  assert.match(adminData, /rpc\("get_admin_promotion_redemption_counts"\)/);
  assert.match(manager, /filterAdminPromotions/);
  assert.match(manager, /Filter promotions by status/);
  assert.match(manager, /Search promotions/);
  assert.match(manager, /getPromotionTargetSummary/);
  assert.match(manager, /tiered_discount_enabled/);
  assert.match(manager, /per_account_redemption_limit/);
  assert.match(manager, /utilizationPercent/);
});
