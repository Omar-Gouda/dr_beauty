import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getCairoVisitorPeriod } from "../src/lib/admin-user-analytics.mjs";
import { normalizeCairoRevenueMetrics } from "../src/lib/admin-dashboard.mjs";
import { validateWhatsAppChannelUrl } from "../src/lib/whatsapp/channel.mjs";
import { buildDiscountCommunityMessage } from "../src/lib/whatsapp/messages.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Cairo dashboard boundaries use midnight for the local day and month", () => {
  const period = getCairoVisitorPeriod(new Date("2026-11-10T21:30:00.000Z"));
  assert.equal(period.todayStart, "2026-11-09T22:00:00.000Z");
  assert.equal(period.monthStart, "2026-10-31T22:00:00.000Z");
  assert.equal(period.timeZone, "Africa/Cairo");
});

test("Cairo revenue RPC uses retained order snapshots and actual redeemed ledger records", async () => {
  const sql = await read("../supabase/migrations/20261204000000_cairo_dashboard_revenue_metrics.sql");
  assert.match(sql, /date_trunc\('day',[\s\S]*Africa\/Cairo/);
  assert.match(sql, /date_trunc\('month',[\s\S]*Africa\/Cairo/);
  assert.match(sql, /order_row\.order_status <> 'cancelled'/);
  assert.match(sql, /order_row\.order_status = 'delivered'[\s\S]*order_row\.payment_status = 'paid'/);
  assert.match(sql, /order_row\.payment_status <> 'refunded'/);
  assert.match(sql, /redemption\.status = 'redeemed'[\s\S]*redemption\.qualified_at >= v_month_start/);
  assert.match(sql, /sum\(redemption\.discount_amount\)/);
  assert.doesNotMatch(sql, /promotion_code_snapshot/);
  assert.match(sql, /grant execute on function public\.get_admin_cairo_revenue_metrics\(\) to authenticated/);
});

test("revenue metric normalization refuses partial or malformed results", () => {
  const values = {
    total_orders: "4", today_orders: "1", mtd_orders: "2",
    today_delivered_value: "100.00", mtd_delivered_value: "200.00",
    today_collected_revenue: "80.00", mtd_collected_revenue: "170.00",
    today_discount_uses: "1", mtd_discount_uses: "2",
    today_discount_amount: "10.00", mtd_discount_amount: "30.00",
  };
  assert.equal(normalizeCairoRevenueMetrics(values).todayOrders, 1);
  assert.equal(normalizeCairoRevenueMetrics({ ...values, today_orders: "bad" }), null);
  assert.equal(normalizeCairoRevenueMetrics(null), null);
});

test("dashboard exposes all Cairo revenue values and independently filters all promotion statuses", async () => {
  const dashboard = await read("../src/components/admin/AdminDashboard.jsx");
  const promotions = await read("../src/components/admin/AdminAvailableDiscounts.jsx");
  const adminData = await read("../src/lib/admin.js");
  for (const label of ["Total Orders", "Today's Orders", "Orders This Month", "Today's Revenue", "Revenue This Month", "Collected Revenue Today", "Collected Revenue This Month", "Discounts Used Today", "Discounts Used This Month", "Discount Value Today", "Discount Value This Month"]) assert.ok(dashboard.includes(label));
  assert.doesNotMatch(dashboard, /unavailableNote="Africa\/Cairo"|Orders MTD|Discounts Used MTD|Discount amount MTD/);
  for (const lifecycle of ["Active", "Scheduled", "Expired", "Disabled"]) assert.ok(promotions.includes(lifecycle));
  assert.match(promotions, /getPromotionCapacity/);
  assert.match(promotions, /redemption_counts\?\.redeemed_count/);
  assert.match(promotions, /admin\/promotions\?edit=/);
  assert.match(adminData, /rpc\("get_admin_promotion_redemption_counts"\)/);
  assert.match(adminData, /from\("promotions"\)/);
});

test("announcement composer previews, copies, and opens a configured channel without automatic posting", async () => {
  const composer = await read("../src/components/admin/AdminAnnouncementComposer.jsx");
  assert.match(composer, /Announcement preview/);
  assert.match(composer, /navigator\.clipboard\.writeText/);
  assert.match(composer, /href=\{channelUrl\}/);
  assert.match(composer, /Nothing is sent automatically/);
  assert.equal(validateWhatsAppChannelUrl("https://whatsapp.com/channel/Abc123"), "https://whatsapp.com/channel/Abc123");
  assert.equal(validateWhatsAppChannelUrl("https://whatsapp.com/channel/Abc123?text=hello"), null);
});

test("new promotion message contains eligibility details and editing does not trigger a second share flow", async () => {
  const message = buildDiscountCommunityMessage({
    code: "TIERED", title: "Skin care offer", discount_type: "percentage", discount_value: 10,
    per_account_redemption_limit: 1, first_purchase_only: true, application_scope: "categories",
    tiered_discount_enabled: true,
    discount_tiers: [{ minimumSubtotal: "500", discountType: "fixed_amount", discountValue: "75", maximumDiscount: "60" }],
  });
  assert.match(message, /^Purpose: Share a Dr\. Beauty promotional offer\./);
  assert.match(message, /Limit per account: 1\./);
  assert.match(message, /First qualifying purchase only\./);
  assert.match(message, /selected categories only\./);
  assert.match(message, /highest eligible tier applies once/);
  assert.match(message, /From EGP 500\.00: EGP 75\.00 \(maximum EGP 60\.00\)/);
  const actions = await read("../src/app/admin/actions.js");
  const manager = await read("../src/components/admin/AdminPromotionsManager.jsx");
  assert.match(actions, /savedPromotion: id \? null : \{ \.\.\.savedPromotion, discount_tiers: promotionTiers \}/);
  assert.match(manager, /if \(result\.savedPromotion\) setSharePromotion\(result\.savedPromotion\)/);
  assert.match(manager, /router\.replace\("\/admin\/promotions", \{ scroll: false \}\)/);
});
