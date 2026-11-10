import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculateTierDiscountCents, validatePromotionTiers } from "../src/lib/promotion-tiers.mjs";

const migration = await readFile(new URL("../supabase/migrations/20261201000000_phase2b_tiered_promotions.sql", import.meta.url), "utf8");
const phase2a = await readFile(new URL("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql", import.meta.url), "utf8");
const checkoutActions = await readFile(new URL("../src/app/(checkout)/checkout/actions.js", import.meta.url), "utf8");
const adminActions = await readFile(new URL("../src/app/admin/actions.js", import.meta.url), "utf8");

const tiers = [
  { minimumSubtotal: "0", discountType: "fixed_amount", discountValue: "10", maximumDiscount: "" },
  { minimumSubtotal: "100", discountType: "percentage", discountValue: "20", maximumDiscount: "30" },
  { minimumSubtotal: "250", discountType: "fixed_amount", discountValue: "90", maximumDiscount: "" },
];

test("chooses only the highest qualifying tier and no tier below the first threshold", () => {
  assert.equal(calculateTierDiscountCents(25_000, tiers), 9_000);
  assert.equal(calculateTierDiscountCents(10_000, tiers), 2_000);
  assert.equal(calculateTierDiscountCents(0, tiers), 0);
  assert.equal(calculateTierDiscountCents(0, tiers.slice(1)), null);
});

test("percentage, fixed, tier cap, promotion cap, and eligible-subtotal caps are respected", () => {
  assert.equal(calculateTierDiscountCents(15_000, tiers.slice(0, 2)), 3_000);
  assert.equal(calculateTierDiscountCents(15_000, tiers.slice(0, 2), { maximum_discount: "12.50" }), 1_250);
  assert.equal(calculateTierDiscountCents(1_500, [
    { minimumSubtotal: "0", discountType: "fixed_amount", discountValue: "100", maximumDiscount: "" },
  ]), 1_500);
});

test("tier validation rejects duplicate thresholds, invalid types, caps, and empty enabled configurations", () => {
  assert.deepEqual(validatePromotionTiers(tiers, true), tiers.map((tier) => ({ ...tier, maximumDiscount: tier.maximumDiscount || null })));
  assert.deepEqual(validatePromotionTiers([], false), []);
  assert.equal(validatePromotionTiers([], true), null);
  assert.equal(validatePromotionTiers([...tiers, tiers[0]], true), null);
  assert.equal(validatePromotionTiers([{ minimumSubtotal: "0", discountType: "percentage", discountValue: "101" }], true), null);
  assert.equal(validatePromotionTiers([{ minimumSubtotal: "0", discountType: "fixed_amount", discountValue: "5", maximumDiscount: "0" }], true), null);
  assert.equal(validatePromotionTiers(tiers, false).length, tiers.length);
});

test("database schema uses cascade tier cleanup, normalized thresholds, and admin-only reads", () => {
  assert.match(migration, /promotion_id uuid not null references public\.promotions\(id\) on delete cascade/);
  assert.match(migration, /unique \(promotion_id, minimum_subtotal\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /promotion_discount_tiers_admin_read[\s\S]*?private\.is_admin\(\)/);
  assert.match(migration, /grant execute on function public\.save_admin_promotion\(jsonb, uuid\[\], uuid\[\], jsonb\) to authenticated/);
});

test("tiered checkout selects one highest threshold using targeted eligible subtotal", () => {
  assert.match(migration, /tier\.minimum_subtotal <= v_eligible_subtotal[\s\S]*?order by tier\.minimum_subtotal desc/);
  assert.match(migration, /if v_promotion\.tiered_discount_enabled then[\s\S]*?else[\s\S]*?v_promotion\.discount_value/);
  assert.match(migration, /v_discount := least\(v_discount, v_eligible_subtotal\)/);
  assert.match(phase2a, /v_promotion\.first_purchase_only and exists[\s\S]*?private\.account_first_purchases/);
});

test("checkout serializes per-promotion capacity and checks the Phase 1 redemption ledger", () => {
  assert.match(migration, /for update;[\s\S]*?from private\.promotion_redemptions as redemption/);
  assert.match(migration, /redemption\.status in \('reserved', 'redeemed', 'refunded'\)/);
  assert.match(migration, /v_account_redemptions >= v_promotion\.per_account_redemption_limit/);
  assert.match(migration, /pg_get_functiondef[\s\S]*?Unexpected promotion capacity block in checkout/);
});

test("preview delegates trusted price, targeting, and tier calculations to PostgreSQL", () => {
  assert.match(checkoutActions, /get_promotion_tier_quote/);
  assert.match(checkoutActions, /p_items: items/);
  assert.match(migration, /create function public\.get_promotion_tier_quote/);
  assert.match(migration, /join public\.products as product on product\.id = requested\.product_id and product\.is_active/);
  assert.match(migration, /promotion_category_targets/);
  assert.match(migration, /selected_tier_minimum numeric/);
});

test("admin validates tiers and saves them atomically with the existing promotion and target RPC", () => {
  assert.match(adminActions, /validatePromotionTiers\(input\.discountTiers, tieredDiscountEnabled\)/);
  assert.match(adminActions, /rpc\("save_admin_promotion"[\s\S]*?p_tiers:/);
  assert.match(migration, /from public\.save_admin_promotion\(p_promotion, p_product_ids, p_category_ids\)/);
  assert.match(migration, /delete from public\.promotion_discount_tiers[\s\S]*?insert into public\.promotion_discount_tiers/);
});

test("order financial snapshots remain captured by the existing immutable checkout path", () => {
  assert.match(phase2a, /discount_amount, currency\s*\)[\s\S]*?v_subtotal, v_shipping, v_shipping_discount, v_discount/);
  assert.match(migration, /execute v_definition/);
  assert.doesNotMatch(migration, /update public\.orders[\s\S]*?discount_amount\s*=/);
});
