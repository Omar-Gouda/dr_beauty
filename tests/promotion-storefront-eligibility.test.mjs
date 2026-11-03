import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const projection = await readFile(
  new URL("../supabase/migrations/20261115000000_public_redeemable_featured_promotions.sql", import.meta.url),
  "utf8",
);
const checkout = await readFile(
  new URL("../supabase/migrations/20261112000000_checkout_discount_least_expression_fix.sql", import.meta.url),
  "utf8",
);

test("eligible featured offers must be active and have usable public text", () => {
  assert.match(projection, /promotion\.is_featured\s+and promotion\.is_active/);
  assert.match(projection, /nullif\(pg_catalog\.btrim\(promotion\.code\), ''\) is not null/);
  assert.match(projection, /nullif\(pg_catalog\.btrim\(promotion\.title\), ''\) is not null/);
});

test("inactive promotions are excluded from the public projection", () => {
  assert.match(projection, /and promotion\.is_active/);
});

test("future promotions are excluded until their start time", () => {
  assert.match(projection, /promotion\.starts_at is null or promotion\.starts_at <= pg_catalog\.statement_timestamp\(\)/);
});

test("expired promotions are excluded at their end time", () => {
  assert.match(projection, /promotion\.ends_at is null or promotion\.ends_at > pg_catalog\.statement_timestamp\(\)/);
});

test("a promotion at its redemption cap is excluded using non-cancelled orders", () => {
  assert.match(projection, /promotion\.maximum_redemptions is null[\s\S]*?count\(\*\)[\s\S]*?existing_order\.promotion_id = promotion\.id[\s\S]*?existing_order\.order_status <> 'cancelled'[\s\S]*?\)\s*< promotion\.maximum_redemptions/);
});

test("a capped promotion below its redemption limit remains eligible", () => {
  assert.match(projection, /\) < promotion\.maximum_redemptions/);
  assert.match(checkout, /v_redemptions >= v_promotion\.maximum_redemptions/);
});

test("eligible featured promotions retain priority order and bounded limits", () => {
  assert.match(projection, /order by promotion\.display_priority desc, promotion\.code asc/);
  assert.match(projection, /limit least\(greatest\(coalesce\(p_limit, 24\), 1\), 24\)/i);
});

test("the public return projection includes storefront fields but omits internal priority and order data", () => {
  const returnedColumns = projection.match(/returns table\s*\(([\s\S]*?)\)\s*language sql/i)?.[1];
  assert.ok(returnedColumns, "RPC should declare its public return shape");
  const names = returnedColumns
    .split(",")
    .map((column) => column.trim().split(/\s+/)[0]);
  assert.deepEqual(names, [
    "id", "code", "title", "description", "discount_type", "discount_value",
    "maximum_discount", "minimum_subtotal", "starts_at", "ends_at", "target_path",
    "maximum_redemptions",
  ]);
  assert.doesNotMatch(returnedColumns, /display_priority|order_id|user_id|customer|phone|email|address/i);
  assert.match(projection, /order by promotion\.display_priority desc, promotion\.code asc/);
});

test("the RPC is a fixed-search-path definer with only storefront execution grants", () => {
  assert.match(projection, /security definer\s+set search_path = ''/i);
  assert.match(projection, /revoke all on function public\.get_public_featured_promotions\(integer\)\s+from public, anon, authenticated, service_role/i);
  assert.match(projection, /grant execute on function public\.get_public_featured_promotions\(integer\)\s+to anon, authenticated/i);
});

test("the authoritative checkout RPC keeps its date, subtotal, cap, and cancellation rules", () => {
  assert.match(checkout, /v_promotion\.starts_at > v_now/);
  assert.match(checkout, /v_promotion\.ends_at <= v_now/);
  assert.match(checkout, /v_subtotal < v_promotion\.minimum_subtotal/);
  assert.match(checkout, /existing_order\.order_status <> 'cancelled'/);
  assert.match(checkout, /v_redemptions >= v_promotion\.maximum_redemptions/);
});
