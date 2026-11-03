import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("discount announcements require explicit activation, date validity, and remaining redemption capacity", async () => {
  const sql = await source("../supabase/migrations/20261110000000_configured_discount_announcements.sql");
  assert.match(sql, /add column is_announcement boolean not null default false/);
  assert.match(sql, /promotion\.is_announcement\s+and promotion\.is_active/);
  assert.match(sql, /promotion\.starts_at <= pg_catalog\.statement_timestamp\(\)/);
  assert.match(sql, /promotion\.ends_at > pg_catalog\.statement_timestamp\(\)/);
  assert.match(sql, /existing_order\.order_status <> 'cancelled'/);
  assert.match(sql, /order by promotion\.announcement_priority desc, promotion\.code asc\s+limit 6/);
});

test("public announcement RPC exposes only promotional display fields to storefront roles", async () => {
  const sql = await source("../supabase/migrations/20261110000000_configured_discount_announcements.sql");
  const returnedColumns = sql.match(/returns table \(([\s\S]*?)\)/)?.[1] ?? "";
  assert.deepEqual(returnedColumns.match(/\b[a-z_]+\s+(?:text|numeric)\b/g), [
    "code text", "discount_type text", "discount_value numeric", "minimum_subtotal numeric",
  ]);
  assert.match(sql, /security definer\s+set search_path = ''/);
  assert.match(sql, /revoke all on function public\.get_public_discount_announcements\(\)[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(sql, /grant execute on function public\.get_public_discount_announcements\(\)\s+to anon, authenticated/);
  assert.doesNotMatch(returnedColumns, /phone|email|customer|order_id|maximum_redemptions/i);
});

test("announcement bar reads configured discounts and avoids hard-coded shipping or coupon claims", async () => {
  const [bar, layout, catalog, manager, actions] = await Promise.all([
    source("../src/components/layout/AnnouncementBar.jsx"),
    source("../src/components/layout/StoreLayout.jsx"),
    source("../src/lib/catalog.js"),
    source("../src/components/admin/AdminPromotionsManager.jsx"),
    source("../src/app/admin/actions.js"),
  ]);
  assert.match(layout, /getPublicDiscountAnnouncements/);
  assert.match(layout, /<Suspense fallback=/);
  assert.match(catalog, /rpc\("get_public_discount_announcements"\)/);
  assert.match(bar, /Use code/);
  assert.match(bar, /announcement-track/);
  assert.doesNotMatch(bar, /Free shipping on orders over 1,000 EGP/);
  assert.match(manager, /name="isAnnouncement"/);
  assert.match(manager, /name="announcementPriority"/);
  assert.match(actions, /is_announcement: isAnnouncement/);
  assert.match(actions, /announcement_priority: announcementPriority/);
});
