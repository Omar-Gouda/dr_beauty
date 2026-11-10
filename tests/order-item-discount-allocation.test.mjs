import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { allocatePromotionDiscountCents } from "../src/lib/order-discount-allocation.mjs";
import { getOrderItemFinancials } from "../src/lib/order-item-financials.mjs";

const migration = await readFile(new URL("../supabase/migrations/20261202000000_phase2c_order_item_discount_allocations.sql", import.meta.url), "utf8");
const phase2b = await readFile(new URL("../supabase/migrations/20261201000000_phase2b_tiered_promotions.sql", import.meta.url), "utf8");
const phase2a = await readFile(new URL("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql", import.meta.url), "utf8");
const immutability = await readFile(new URL("../supabase/migrations/20261128000000_preserve_order_item_generated_total_on_detachment.sql", import.meta.url), "utf8");
const customerReceipt = await readFile(new URL("../src/app/(account)/orders/[orderNumber]/page.js", import.meta.url), "utf8");
const adminOrderView = await readFile(new URL("../src/components/admin/AdminOrdersManager.jsx", import.meta.url), "utf8");
const adminQueries = await readFile(new URL("../src/lib/admin.js", import.meta.url), "utf8");

function allocatedTotal(rows) {
  return rows?.reduce((sum, row) => sum + row.discountCents, 0);
}

test("targeted product allocation leaves ineligible items at zero", () => {
  const rows = allocatePromotionDiscountCents([
    { id: "prod-a", lineCents: 6_000, eligible: true },
    { id: "prod-b", lineCents: 4_000, eligible: false },
  ], 1_000);
  assert.deepEqual(rows, [{ id: "prod-a", discountCents: 1_000 }, { id: "prod-b", discountCents: 0 }]);
});

test("category and order-wide promotions allocate only to their qualifying lines", () => {
  const categoryRows = allocatePromotionDiscountCents([
    { id: "a", lineCents: 4_000, eligible: false },
    { id: "b", lineCents: 3_000, eligible: true },
    { id: "c", lineCents: 3_000, eligible: true },
  ], 1_000);
  assert.deepEqual(categoryRows, [{ id: "a", discountCents: 0 }, { id: "b", discountCents: 500 }, { id: "c", discountCents: 500 }]);
  const orderRows = allocatePromotionDiscountCents([
    { id: "a", lineCents: 2_000, eligible: true },
    { id: "b", lineCents: 8_000, eligible: true },
  ], 1_000);
  assert.deepEqual(orderRows, [{ id: "a", discountCents: 200 }, { id: "b", discountCents: 800 }]);
});

test("fixed, percentage, capped and tiered checkout discounts allocate the already-calculated total", () => {
  const items = [
    { id: "a", lineCents: 3_000, eligible: true },
    { id: "b", lineCents: 7_000, eligible: true },
  ];
  for (const discountCents of [700, 1_000, 2_500]) {
    const rows = allocatePromotionDiscountCents(items, discountCents);
    assert.equal(allocatedTotal(rows), discountCents);
  }
  assert.match(phase2b, /v_discount := pg_catalog\.round\(v_eligible_subtotal \* v_tier\.discount_value \/ 100, 2\)/);
  assert.match(phase2b, /least\(v_discount, v_tier\.maximum_discount\)/);
});

test("largest-remainder rounding is deterministic and preserves every cent", () => {
  const rows = allocatePromotionDiscountCents([
    { id: "c", lineCents: 100, eligible: true },
    { id: "b", lineCents: 100, eligible: true },
    { id: "a", lineCents: 100, eligible: true },
  ], 1);
  assert.deepEqual(rows, [
    { id: "c", discountCents: 0 },
    { id: "b", discountCents: 0 },
    { id: "a", discountCents: 1 },
  ]);
  assert.equal(allocatedTotal(rows), 1);
});

test("zero and fully discounted items remain bounded by each original item subtotal", () => {
  const items = [
    { id: "free", lineCents: 0, eligible: true },
    { id: "one", lineCents: 1, eligible: true },
    { id: "two", lineCents: 2, eligible: true },
  ];
  assert.deepEqual(allocatePromotionDiscountCents(items, 0), items.map(({ id }) => ({ id, discountCents: 0 })));
  const fullyDiscounted = allocatePromotionDiscountCents(items, 3);
  assert.deepEqual(fullyDiscounted, [{ id: "free", discountCents: 0 }, { id: "one", discountCents: 1 }, { id: "two", discountCents: 2 }]);
  assert.equal(allocatePromotionDiscountCents([{ id: "x", lineCents: 10, eligible: false }], 1), null);
  assert.equal(allocatePromotionDiscountCents([{ id: "x", lineCents: 10, eligible: true }], 11), null);
});

test("legacy order items without an allocation remain identifiable without inventing a final amount", () => {
  assert.deepEqual(getOrderItemFinancials({ line_total: "29.99", promotion_discount_amount: null }), {
    originalSubtotalCents: 2_999,
    promotionDiscountCents: null,
    finalItemTotalCents: null,
    allocationAvailable: false,
  });
  assert.equal(getOrderItemFinancials({ line_total: "29.99", promotion_discount_amount: "2.50" }).finalItemTotalCents, 2_749);
});

test("database stores immutable allocations and defers exact equality validation until checkout items exist", () => {
  assert.match(migration, /add column promotion_discount_amount numeric\(14, 2\)/);
  assert.match(migration, /promotion_discount_amount <= unit_price \* quantity/);
  assert.match(migration, /create constraint trigger orders_item_discount_allocation_valid[\s\S]*?deferrable initially deferred/);
  assert.match(migration, /v_allocated_total is distinct from new\.discount_amount/);
  assert.match(migration, /sum\(base_discount_cents\) over \(\)/);
  assert.match(migration, /remainder_rank_value desc, product_id/);
  assert.match(migration, /promotion_discount_amount\)[\s\S]*?from ranked/);
  assert.match(phase2a, /insert into public\.order_items[\s\S]*?p\.price, requested\.quantity/);
});

test("product detachment immutability compares all other row fields, including the new allocation column", () => {
  assert.match(immutability, /pg_catalog\.to_jsonb\(new\) - 'product_id' - 'line_total'[\s\S]*?pg_catalog\.to_jsonb\(old\) - 'product_id' - 'line_total'/);
  assert.match(immutability, /old\.line_total is not distinct from[\s\S]*?new\.unit_price \* new\.quantity/);
  assert.match(migration, /NULL means this historical order predates item-level allocation/);
});

test("promotion tiers and targeted product/category data feed the allocation insert from database state", () => {
  assert.match(phase2b, /tier\.minimum_subtotal <= v_eligible_subtotal/);
  assert.match(migration, /promotion_product_targets/);
  assert.match(migration, /promotion_category_targets/);
  assert.match(migration, /v_promotion\.application_scope = 'order' then true/);
  assert.match(migration, /execute v_definition/);
});

test("customer and admin order views display item allocation and preserve old-order fallback", () => {
  assert.match(customerReceipt, /items:order_items\([^)]*promotion_discount_amount\)/);
  assert.match(customerReceipt, /promotion_code_snapshot/);
  assert.match(customerReceipt, /Original item subtotal/);
  assert.match(customerReceipt, /Final item total/);
  assert.match(customerReceipt, /Historical item discount allocation is unavailable/);
  assert.match(adminQueries, /order_items\([^)]*promotion_discount_amount\)/);
  assert.match(adminOrderView, /getOrderItemFinancials/);
  assert.match(adminOrderView, /Not recorded for this order/);
  assert.match(adminOrderView, /Total promotion discount/);
});
