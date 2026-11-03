import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculatePromotionDiscountCents, calculateShippingBreakdownCents, getPromotionCodeSubmissionState, parseMoneyCents } from "../src/lib/promotions.mjs";

test("money parsing uses exact cents and rejects unsupported precision", () => {
  assert.equal(parseMoneyCents("125.5"), 12550);
  assert.equal(parseMoneyCents("0.00"), 0);
  assert.equal(parseMoneyCents("1.001"), null);
  assert.equal(parseMoneyCents("-1.00"), null);
});

test("percentage promotions round to cents and respect maximum discount and subtotal", () => {
  assert.equal(calculatePromotionDiscountCents(12345, {
    discount_type: "percentage", discount_value: "10.00", minimum_subtotal: "0", maximum_discount: null,
  }), 1235);
  assert.equal(calculatePromotionDiscountCents(12345, {
    discount_type: "percentage", discount_value: "50.00", minimum_subtotal: "0", maximum_discount: "20.00",
  }), 2000);
  assert.equal(calculatePromotionDiscountCents(500, {
    discount_type: "percentage", discount_value: "50.00", minimum_subtotal: "0", maximum_discount: null,
  }), 250);
});

test("fixed discounts are capped at subtotal and minimum thresholds are enforced", () => {
  assert.equal(calculatePromotionDiscountCents(2500, {
    discount_type: "fixed_amount", discount_value: "50.00", minimum_subtotal: "0", maximum_discount: null,
  }), 2500);
  assert.equal(calculatePromotionDiscountCents(9999, {
    discount_type: "fixed_amount", discount_value: "10.00", minimum_subtotal: "100.00", maximum_discount: null,
  }), null);
});

test("an entered discount code must be previewed for the current cart before checkout submits it", async () => {
  const action = await readFile(new URL("../src/app/(checkout)/checkout/CheckoutForm.jsx", import.meta.url), "utf8");
  assert.equal(getPromotionCodeSubmissionState("SAVE10", null, "cart-a"), "must_apply");
  assert.equal(getPromotionCodeSubmissionState("SAVE10", { code: "SAVE10", signature: "cart-old" }, "cart-a"), "stale");
  assert.equal(getPromotionCodeSubmissionState("SAVE10", { code: "SAVE10", signature: "cart-a" }, "cart-a"), "applied");
  assert.equal(getPromotionCodeSubmissionState("  ", null, "cart-a"), "none");
  assert.match(action, /promotionSubmissionState !== "none" && !promotionApplied/);
  assert.match(action, /promotionCode: promotionApplied \? promotionQuote\.code : null/);
});

test("shipping quotes require configured delivery and show gross fee plus the free-shipping discount", () => {
  assert.deepEqual(calculateShippingBreakdownCents(99900, {
    is_shipping_enabled: true, default_fee: "60.00", free_shipping_minimum_subtotal: "1000.00",
  }), {
    shippingFeeCents: 6000, shippingDiscountCents: 0, shippingAmountCents: 6000,
    freeShippingMinimumCents: 100000, totalAmountCents: 105900,
  });
  assert.deepEqual(calculateShippingBreakdownCents(100000, {
    is_shipping_enabled: true, default_fee: "60.00", free_shipping_minimum_subtotal: "1000.00",
  }), {
    shippingFeeCents: 6000, shippingDiscountCents: 0, shippingAmountCents: 6000,
    freeShippingMinimumCents: 100000, totalAmountCents: 106000,
  });
  assert.deepEqual(calculateShippingBreakdownCents(100001, {
    is_shipping_enabled: true, default_fee: "60.00", free_shipping_minimum_subtotal: "1000.00",
  }), {
    shippingFeeCents: 6000, shippingDiscountCents: 6000, shippingAmountCents: 0,
    freeShippingMinimumCents: 100000, totalAmountCents: 100001,
  });
  assert.equal(calculateShippingBreakdownCents(100, { is_shipping_enabled: false, default_fee: "60.00" }), null);
});

test("checkout forwards the promotion code to the existing server-authoritative order RPC", async () => {
  const action = await readFile(new URL("../src/app/(checkout)/checkout/actions.js", import.meta.url), "utf8");
  const sql = await readFile(new URL("../supabase/migrations/20261024000000_cod_order_idempotency_payload.sql", import.meta.url), "utf8");
  assert.match(action, /p_promotion_code:\s*promotionCode/);
  assert.match(sql, /v_promotion\.maximum_redemptions/);
  assert.match(sql, /for update/);
  assert.match(sql, /v_subtotal\s*<\s*v_promotion\.minimum_subtotal/);
});

test("shipping configuration is read by the SECURITY DEFINER order RPC and persisted in the order breakdown", async () => {
  const [migration, original] = await Promise.all([
    readFile(new URL("../supabase/migrations/20261109000000_shipping_configuration_featured_promotions_and_reviews.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20261024000000_cod_order_idempotency_payload.sql", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /create or replace function public\.create_cod_order\([\s\S]*?security definer\s+set search_path = ''/);
  assert.match(migration, /select settings\.\* into v_shipping_settings[\s\S]*?from public\.shipping_settings/);
  assert.match(migration, /generated always as \(shipping_amount \+ shipping_discount_amount\) stored/);
  assert.match(migration, /subtotal, shipping_amount, shipping_discount_amount, discount_amount, currency/);
  assert.match(migration, /v_total := v_subtotal \+ v_shipping - v_discount/);
  const originalSignature = original.match(/create or replace function public\.create_cod_order\([\s\S]*?returns table \([\s\S]*?\n\)/)?.[0];
  const replacementSignature = migration.match(/create or replace function public\.create_cod_order\([\s\S]*?returns table \([\s\S]*?\n\)/)?.[0];
  assert.equal(replacementSignature, originalSignature);
});

test("forward checkout fix uses PostgreSQL LEAST expressions without changing the order RPC contract", async () => {
  const [source, fix] = await Promise.all([
    readFile(new URL("../supabase/migrations/20261109000000_shipping_configuration_featured_promotions_and_reviews.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20261112000000_checkout_discount_least_expression_fix.sql", import.meta.url), "utf8"),
  ]);
  const functionMarker = "create or replace function public.create_cod_order(";
  const functionEnd = "$$;";
  const sourceStart = source.indexOf(functionMarker);
  const fixStart = fix.indexOf(functionMarker);
  const sourceFunction = source.slice(sourceStart, source.indexOf(functionEnd, sourceStart) + functionEnd.length);
  const fixedFunction = fix.slice(fixStart, fix.indexOf(functionEnd, fixStart) + functionEnd.length);
  assert.equal((sourceFunction.match(/pg_catalog\.least\(/g) ?? []).length, 3);
  assert.equal(fixedFunction, sourceFunction.replaceAll("pg_catalog.least(", "least("));
  assert.match(fixedFunction, /security definer\s+set search_path = ''/i);
  assert.doesNotMatch(fix, /^\s*(?:grant|revoke)\b/im);
});
