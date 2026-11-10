import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getCairoVisitorPeriod,
  normalizeUserAnalytics,
} from "../src/lib/admin-user-analytics.mjs";

const migration = await readFile(new URL("../supabase/migrations/20261203000000_admin_user_dashboard_analytics.sql", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/admin/AdminDashboard.jsx", import.meta.url), "utf8");
const profileEditor = await readFile(new URL("../src/components/account/ProfileEditor.jsx", import.meta.url), "utf8");
const visitorRoute = await readFile(new URL("../src/app/api/visitor-tracking/route.js", import.meta.url), "utf8");
const visitorTracker = await readFile(new URL("../src/components/analytics/VisitorTracker.jsx", import.meta.url), "utf8");
const metadataLayout = await readFile(new URL("../src/app/layout.js", import.meta.url), "utf8");
const openGraphImage = await readFile(new URL("../src/app/opengraph-image.js", import.meta.url), "utf8");
const sidebar = await readFile(new URL("../src/components/admin/AdminSidebar.jsx", import.meta.url), "utf8");

test("Cairo visitor boundaries follow the local calendar day and month", () => {
  const beforeMidnight = getCairoVisitorPeriod("2026-11-30T21:59:59.000Z");
  const afterMidnight = getCairoVisitorPeriod("2026-11-30T22:00:00.000Z");
  assert.equal(beforeMidnight.todayStart, "2026-11-29T22:00:00.000Z");
  assert.equal(beforeMidnight.monthStart, "2026-10-31T22:00:00.000Z");
  assert.equal(beforeMidnight.today.day, 30);
  assert.equal(afterMidnight.todayStart, "2026-11-30T22:00:00.000Z");
  assert.equal(afterMidnight.monthStart, "2026-11-30T22:00:00.000Z");
  assert.equal(afterMidnight.today.month, 12);
});

test("visitor unique counts and closed monthly snapshots are database idempotent", () => {
  assert.match(migration, /primary key \(visit_date, visitor_hash\)/i);
  assert.match(migration, /on conflict \(visit_date, visitor_hash\) do nothing/i);
  assert.match(migration, /count\(distinct visitor\.visitor_hash\)/i);
  assert.match(migration, /on conflict \(month_start\) do nothing/i);
  assert.match(migration, /delete from private\.admin_daily_visitors[\s\S]*?exists\s*\([\s\S]*?admin_monthly_visitor_snapshots/i);
  assert.match(migration, /Africa\/Cairo/);
});

test("visitor tracking signs an anonymous first-party cookie and never accepts client dates or totals", () => {
  assert.match(visitorRoute, /createHmac\("sha256"/);
  assert.match(visitorRoute, /httpOnly: true/);
  assert.match(visitorRoute, /sameOrigin\(request\)/);
  assert.match(visitorRoute, /p_visitor_hash: visitorHash/);
  assert.doesNotMatch(visitorRoute, /x-forwarded-for|request\.ip|p_visit_date|p_count/);
  assert.match(visitorTracker, /pathname\.startsWith\("\/admin"\)/);
  assert.match(migration, /record_admin_visitor\(text\) to service_role/i);
});

test("new-user and total-customer metrics aggregate auth accounts without exposing profile rows", () => {
  assert.match(migration, /from auth\.users as account[\s\S]*?account\.created_at >= pg_catalog\.clock_timestamp\(\) - interval '7 days'/i);
  assert.match(migration, /'total_users',[\s\S]*?from auth\.users as account/i);
  assert.match(migration, /not exists \(select 1 from public\.user_roles as role where role\.user_id = account\.id\)/i);
  assert.match(migration, /if auth\.uid\(\) is null or not private\.is_admin\(\)/i);
  assert.match(migration, /grant execute on function public\.get_admin_user_dashboard_metrics\(\) to authenticated/i);
  assert.match(migration, /revoke all on function public\.get_admin_user_dashboard_metrics\(\) from public, anon, authenticated, service_role/i);
});

test("buyer ranking excludes cancelled orders and elite ranking uses paid delivered snapshots", () => {
  assert.match(migration, /where analytics\.is_delivered[\s\S]*?group by analytics\.account_id[\s\S]*?limit 5/i);
  assert.match(migration, /where analytics\.is_paid_and_delivered[\s\S]*?sum\(analytics\.order_total_snapshot\)[\s\S]*?limit 3/i);
  assert.match(migration, /case when coalesce\(profile\.show_public_ranking, true\)[\s\S]*?'Private member'/i);
  assert.match(migration, /new\.payment_status = 'paid'/i);
  assert.match(migration, /order_status = 'delivered'/i);
  assert.match(migration, /on conflict \(order_id\) do update/i);
});

test("ranking preference defaults enabled and profile editor lets customers opt out", () => {
  assert.match(migration, /add column show_public_ranking boolean not null default true/i);
  assert.match(migration, /grant update \(show_public_ranking\) on public\.profiles to authenticated/i);
  assert.match(profileEditor, /I agree to show my name in customer rankings/);
  assert.match(profileEditor, /formData\.set\("showPublicRanking"/);
});

test("metrics distinguish unavailable values from zero and keep ranking display data", () => {
  assert.equal(normalizeUserAnalytics(null), null);
  const unavailableVisitors = normalizeUserAnalytics({ total_users: 12, new_users_7d: 2, visitors_today: 0, visitors_mtd: 0, top_buyers: [], elites: [] }, { visitorTrackingReady: false });
  assert.equal(unavailableVisitors.totalUsers, 12);
  assert.equal(unavailableVisitors.newUsers, 2);
  assert.equal(unavailableVisitors.visitorsToday, null);
  assert.equal(unavailableVisitors.visitorsMtd, null);
  assert.match(unavailableVisitors.trackingUnavailableReason, /not configured/);
  const result = normalizeUserAnalytics({
    total_users: 8,
    new_users_7d: 1,
    visitors_today: 0,
    visitors_mtd: 3,
    top_buyers: Array.from({ length: 7 }, (_, index) => ({ display_name: index === 0 ? "Private member" : `Buyer ${index}`, qualifying_orders: 7 - index })),
    elites: [{ display_name: "Beauty customer", purchase_value: "1200.00" }],
    monthly_visitor_history: [{ month_start: "2026-10-01", unique_visitors: 14 }],
  });
  assert.equal(result.visitorsToday, 0);
  assert.equal(result.topBuyers.length, 5);
  assert.equal(result.topBuyers[0].displayName, "Private member");
  assert.equal(result.topBuyers[0].count, 7);
  assert.equal(result.elites[0].value, 1200);
  assert.equal(result.monthlyVisitorHistory[0].unique_visitors, 14);
});

test("dashboard has four independent native disclosure sections and usable empty/error states", () => {
  for (const title of ["Users", "Revenue", "Available Discounts", "Announcements"]) assert.match(dashboard, new RegExp(`<DashboardSection title="${title}"`));
  assert.match(dashboard, /<details open=\{defaultOpen\}/);
  assert.match(dashboard, /defaultOpen/);
  assert.match(dashboard, /No qualifying customers yet/);
  assert.match(dashboard, /Available discounts unavailable/);
  assert.match(dashboard, /No live discount announcements/);
  assert.match(dashboard, /Data unavailable/);
  assert.match(dashboard, /<AdminSalesChart/);
  assert.doesNotMatch(sidebar, />Secure</);
});

test("root and route metadata provide branded social cards, canonical URLs, and existing brand icons", async () => {
  assert.match(metadataLayout, /metadataBase/);
  assert.match(metadataLayout, /openGraph:/);
  assert.match(metadataLayout, /twitter:/);
  assert.match(metadataLayout, /logo-SVG\.svg/);
  assert.match(openGraphImage, /width: 1200, height: 630/);
  assert.match(openGraphImage, /logo-SVG\.svg/);
  const home = await readFile(new URL("../src/app/(store)/page.js", import.meta.url), "utf8");
  const offers = await readFile(new URL("../src/app/(store)/offers/page.js", import.meta.url), "utf8");
  const product = await readFile(new URL("../src/app/(store)/products/[slug]/page.js", import.meta.url), "utf8");
  assert.match(home, /canonical: "\/"/);
  assert.match(offers, /canonical: "\/offers"/);
  assert.match(product, /export async function generateMetadata/);
  assert.match(product, /alternates: \{ canonical:/);
});
