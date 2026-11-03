import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildAdminOrderSearchExpression,
  buildAdminOrdersPageHref,
  getAdminOrderPageCount,
  normalizeAdminOrderFilters,
} from "../src/lib/admin-order-query.mjs";

const adminSource = await readFile(new URL("../src/lib/admin.js", import.meta.url), "utf8");
const managerSource = await readFile(new URL("../src/components/admin/AdminOrdersManager.jsx", import.meta.url), "utf8");
const orderLoader = adminSource.split("export async function getAdminOrders(input = {}) {")[1]
  ?.split("\nexport async function getAdminServiceRequests")[0];

test("pagination uses bounded supported sizes and handles first/last page boundaries", () => {
  assert.deepEqual(normalizeAdminOrderFilters({}), {
    search: "", status: "all", page: 1, pageSize: 25,
  });
  assert.equal(normalizeAdminOrderFilters({ page: "0", pageSize: "500" }).page, 1);
  assert.equal(normalizeAdminOrderFilters({ page: "999999999", pageSize: "50" }).page, 100000);
  assert.equal(getAdminOrderPageCount(0, 25), 1);
  assert.equal(getAdminOrderPageCount(26, 25), 2);
});

test("stable server ordering adds a unique ID tie-breaker after created_at", () => {
  assert.match(orderLoader, /\.order\("created_at", \{ ascending: false \}\)\s*\.order\("id", \{ ascending: false \}\)/);
  assert.match(orderLoader, /\.range\(\(page - 1\) \* filters\.pageSize, page \* filters\.pageSize - 1\)/);
});

test("search applies to the database query before range pagination, including orders beyond the old cap", () => {
  assert.match(orderLoader, /\.select\([\s\S]*?\{ count: "exact" \}\)/);
  assert.match(orderLoader, /query\.or\(searchExpression\)/);
  assert.doesNotMatch(orderLoader, /\.limit\(100\)/);
  assert.ok(orderLoader.indexOf("query.or(searchExpression)") < orderLoader.indexOf(".range("));
  assert.equal(buildAdminOrderSearchExpression("12345"), "order_number.eq.12345,customer_name.ilike.*12345*,customer_phone.ilike.*12345*");
});

test("status filters combine with search", () => {
  const filters = normalizeAdminOrderFilters({
    q: "  Sara +20100  ", status: "shipped", page: "2", pageSize: "10",
  });
  assert.deepEqual(filters, {
    search: "Sara +20100", status: "shipped", page: 2, pageSize: 10,
  });
  assert.match(orderLoader, /query\.eq\("order_status", filters\.status\)/);
  assert.match(orderLoader, /query\.or\(searchExpression\)/);
  assert.doesNotMatch(orderLoader, /dateFrom|dateTo|query\.gte\(|query\.lt\(/);
});

test("invalid query parameters are safely normalized and PostgREST filter syntax is constrained", () => {
  assert.deepEqual(normalizeAdminOrderFilters({
    q: 'x),is_admin.eq.true,*', status: "administrator", from: "2026-02-30", to: "2026-01-01", page: "-3", pageSize: "11",
  }), {
    search: "xisadmineqtrue", status: "all", page: 1, pageSize: 25,
  });
  assert.equal(buildAdminOrderSearchExpression(""), null);
});

test("pagination links retain normalized filters while changing only the page", () => {
  const href = buildAdminOrdersPageHref({
    search: "Mia skin", status: "confirmed", pageSize: 50,
  }, 3);
  const url = new URL(href, "https://example.invalid");
  assert.equal(url.searchParams.get("q"), "Mia skin");
  assert.equal(url.searchParams.get("status"), "confirmed");
  assert.equal(url.searchParams.has("from"), false);
  assert.equal(url.searchParams.has("to"), false);
  assert.equal(url.searchParams.get("pageSize"), "50");
  assert.equal(url.searchParams.get("page"), "3");
});

test("unauthorized access exits before querying, and empty results remain an explicit empty state", () => {
  assert.ok(orderLoader.indexOf('access.status !== "authorized"') < orderLoader.indexOf('.from("orders")'));
  assert.match(orderLoader, /orders\.length === 0\) return \{ data: \[\], error: null, historyUnavailable: false/);
  assert.match(managerSource, /No persisted orders match these filters/);
});

test("order actions, tracking history, and WhatsApp contact remain available after disclosure", () => {
  assert.match(managerSource, /<OrderLifecycleControls key=/);
  assert.match(managerSource, /tracking_number/);
  assert.match(orderLoader, /tracking_url/);
  assert.match(managerSource, /<WhatsAppAction/);
  assert.match(managerSource, /<details>/);
});
