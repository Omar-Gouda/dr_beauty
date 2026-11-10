import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAdminSalesSeries,
  compareAdminMetric,
  getAdminDashboardRange,
  rankAdminProducts,
  summarizeAdminOrders,
} from "../src/lib/admin-dashboard.mjs";

test("dashboard date windows compare equal-length periods in UTC", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const range = getAdminDashboardRange({ range: "last7" }, now);
  assert.equal(range.start, "2026-11-03T12:00:00.000Z");
  assert.equal(range.end, now.toISOString());
  assert.equal(range.previousStart, "2026-10-27T12:00:00.000Z");
  assert.equal(range.previousEnd, range.start);
  assert.equal(range.bucket, "day");
});

test("custom dates include the full selected end day and reject future, invalid, or oversized ranges", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  const valid = getAdminDashboardRange({ range: "custom", from: "2026-11-01", to: "2026-11-10" }, now);
  assert.equal(valid.start, "2026-11-01T00:00:00.000Z");
  assert.equal(valid.end, "2026-11-11T00:00:00.000Z");
  assert.equal(valid.error, null);
  const future = getAdminDashboardRange({ range: "custom", from: "2026-11-01", to: "2026-11-11" }, now);
  assert.match(future.error, /up to two years/);
  const malformed = getAdminDashboardRange({ range: "custom", from: "2026-02-30", to: "2026-03-02" }, now);
  assert.match(malformed.error, /up to two years/);
  const invalid = getAdminDashboardRange({ range: "custom", from: "2020-01-01", to: "2026-11-10" }, now);
  assert.match(invalid.error, /up to two years/);
  assert.ok(Number.isFinite(Date.parse(invalid.previousStart)));
});

test("historical ranges explicitly report the 45-day retention limitation", () => {
  const now = new Date("2026-11-10T12:00:00.000Z");
  assert.equal(getAdminDashboardRange({ range: "last30" }, now).historyMayBeIncomplete, false);
  assert.equal(getAdminDashboardRange({ range: "last90" }, now).historyMayBeIncomplete, true);
});

test("revenue distinguishes delivered order value from collected COD and excludes cancelled/refunded", () => {
  const summary = summarizeAdminOrders([
    { order_status: "delivered", payment_status: "pending", total_amount: "120.00" },
    { order_status: "delivered", payment_status: "paid", total_amount: "80.00" },
    { order_status: "delivered", payment_status: "refunded", total_amount: "40.00" },
    { order_status: "cancelled", payment_status: "pending", total_amount: "30.00" },
    { order_status: "pending_confirmation", payment_status: "pending", total_amount: "50.00" },
  ]);
  assert.equal(summary.revenue, 200);
  assert.equal(summary.collectedRevenue, 80);
  assert.equal(summary.averageOrderValue, 100);
  assert.equal(summary.orderCount, 5);
  assert.equal(summary.statuses.cancelled, 1);
  assert.equal(summary.completionRate, 75);
});

test("average order value is unavailable when there are no completed non-refunded orders", () => {
  const summary = summarizeAdminOrders([{ order_status: "cancelled", payment_status: "pending", total_amount: 50 }]);
  assert.equal(summary.averageOrderValue, null);
  assert.equal(summary.completionRate, 0);
});

test("sales series groups orders in UTC buckets and counts only delivered non-refunded revenue", () => {
  const range = getAdminDashboardRange({ range: "last7" }, new Date("2026-11-10T12:00:00.000Z"));
  const data = buildAdminSalesSeries([
    { created_at: "2026-11-04T04:00:00.000Z", order_status: "delivered", payment_status: "pending", total_amount: "70" },
    { created_at: "2026-11-04T08:00:00.000Z", order_status: "delivered", payment_status: "refunded", total_amount: "20" },
    { created_at: "2026-11-04T10:00:00.000Z", order_status: "cancelled", payment_status: "pending", total_amount: "30" },
  ], range);
  const day = data.find((point) => point.date === "2026-11-04T00:00:00.000Z");
  assert.equal(data.length, 8);
  assert.equal(day.orders, 3);
  assert.equal(day.revenue, 70);
});

test("product rankings use snapshot quantity and allocated net item value", () => {
  const items = [
    { product_id: "a", product_name_snapshot: "A", product_slug_snapshot: "a", quantity: 4, line_total: "100", promotion_discount_amount: "20" },
    { product_id: "a", product_name_snapshot: "A", product_slug_snapshot: "a", quantity: 1, line_total: "30", promotion_discount_amount: "0" },
    { product_id: "b", product_name_snapshot: "B", product_slug_snapshot: "b", quantity: 2, line_total: "200", promotion_discount_amount: "0" },
  ];
  assert.equal(rankAdminProducts(items, 2, "quantity")[0].productId, "a");
  const byRevenue = rankAdminProducts(items, 2, "revenue");
  assert.equal(byRevenue[0].productId, "b");
  assert.equal(byRevenue[1].revenue, 110);
});

test("relative comparisons are explicit for zero baselines", () => {
  assert.equal(compareAdminMetric(110, 100), 10);
  assert.equal(compareAdminMetric(0, 0), 0);
  assert.equal(compareAdminMetric(1, 0), null);
  assert.equal(compareAdminMetric(null, 0), null);
});
