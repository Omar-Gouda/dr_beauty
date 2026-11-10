import Image from "next/image";
import Link from "next/link";
import { Activity, Boxes, ChevronDown, CircleDollarSign, ClipboardList, Package, ShoppingBag, ShoppingCart, Star, Users } from "lucide-react";
import AdminActivityFeed from "@/components/admin/ui/AdminActivityFeed";
import AdminAnnouncementComposer from "@/components/admin/AdminAnnouncementComposer";
import AdminAvailableDiscounts from "@/components/admin/AdminAvailableDiscounts";
import AdminRankingVisibility from "@/components/admin/AdminRankingVisibility";
import AdminReceiptArchiveSummary from "@/components/admin/AdminReceiptArchiveSummary";
import AdminCard from "@/components/admin/ui/AdminCard";
import AdminChartCard from "@/components/admin/ui/AdminChartCard";
import AdminDataTable from "@/components/admin/ui/AdminDataTable";
import AdminDateRangeFilter from "@/components/admin/ui/AdminDateRangeFilter";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminSalesChart from "@/components/admin/ui/AdminSalesChart";
import AdminStatCard, { formatAdminMetric } from "@/components/admin/ui/AdminStatCard";
import AdminStatusBadge from "@/components/admin/ui/AdminStatusBadge";
import { getCairoVisitorPeriod } from "@/lib/admin-user-analytics.mjs";

const money = (amount) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(amount) || 0);
const dateLabel = (value) => new Intl.DateTimeFormat("en-EG", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));

const orderStatusLabels = [
  ["pending_confirmation", "Pending confirmation", "warning"],
  ["confirmed", "Confirmed", "rose"],
  ["processing", "Processing", "rose"],
  ["shipped", "Shipped", "muted"],
  ["delivered", "Delivered", "success"],
  ["cancelled", "Cancelled", "warning"],
];

function StatusDistribution({ counts }) {
  if (!counts) return <AdminEmptyState title="Order status summary unavailable" description="The selected range contains more records than can be safely aggregated in this view." />;
  const total = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
  return <div className="space-y-4">
    {orderStatusLabels.map(([key, label, tone]) => {
      const count = counts[key] ?? 0;
      const percent = total ? count / total * 100 : 0;
      return <div key={key}>
        <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
          <span className="flex min-w-0 items-center gap-2"><AdminStatusBadge tone={tone}>{label}</AdminStatusBadge></span>
          <span className="shrink-0 font-semibold tabular-nums text-[var(--color-text)]">{count.toLocaleString("en-EG")} <span className="font-normal text-[var(--color-text-secondary)]">({percent.toFixed(0)}%)</span></span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-background)]"><div className={`h-full rounded-full ${key === "delivered" ? "bg-[var(--color-success)]" : key === "cancelled" ? "bg-[var(--color-warning)]" : "bg-[var(--color-primary)]"}`} style={{ width: `${percent}%` }} /></div>
      </div>;
    })}
    <div className="mt-5 flex items-center justify-between border-t border-[var(--color-border)] pt-4">
      <div><p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Completion rate</p><p className="mt-1 font-editorial text-2xl font-bold">{formatAdminMetric(counts.delivered + counts.cancelled ? counts.delivered / (counts.delivered + counts.cancelled) * 100 : null, "percent")}</p></div>
      <p className="max-w-48 text-right text-[10px] leading-relaxed text-[var(--color-text-secondary)]">Delivered ÷ delivered and cancelled orders in the selected period.</p>
    </div>
  </div>;
}

function PendingOrdersPanel({ count, orders }) {
  if (count == null) return <p role="status" className="mt-5 text-xs text-[var(--color-text-secondary)]">Current pending-order count is unavailable.</p>;
  if (!count) return <p className="mt-5 rounded-xl bg-[var(--color-background)] px-4 py-3 text-xs text-[var(--color-text-secondary)]">No orders currently need confirmation.</p>;
  return <div className="mt-5 border-t border-[var(--color-border)] pt-4">
    <div className="mb-2 flex items-center justify-between gap-3"><p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Oldest awaiting confirmation</p><Link href="/admin/orders?status=pending_confirmation" className="text-[10px] font-semibold text-[var(--color-primary)] hover:underline">View queue</Link></div>
    {!orders?.length
      ? <p className="text-xs text-[var(--color-text-secondary)]">Pending orders are counted, but their details are unavailable.</p>
      : <ul className="divide-y divide-[var(--color-border)]">{orders.map((order) => <li key={order.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
        <div><Link href={`/admin/orders?q=${encodeURIComponent(String(order.order_number))}`} className="text-xs font-semibold text-[var(--color-primary)] hover:underline">Order #{order.order_number}</Link><p className="mt-0.5 text-[9px] text-[var(--color-text-secondary)]">Placed {dateLabel(order.created_at)}</p></div>
        <span className="shrink-0 text-xs font-semibold tabular-nums">{money(order.total_amount)}</span>
      </li>)}</ul>}
  </div>;
}

function RecentOrders({ orders }) {
  if (orders == null) return <AdminEmptyState title="Recent orders unavailable" description="Order records could not be loaded. Refresh to try again." />;
  const columns = [
    { key: "order_number", label: "Order", render: (order) => <Link href={`/admin/orders?q=${encodeURIComponent(String(order.order_number))}`} className="font-semibold text-[var(--color-primary)] hover:underline">#{order.order_number}</Link> },
    { key: "created_at", label: "Date", render: (order) => dateLabel(order.created_at) },
    { key: "total_amount", label: "Value", cellClassName: "font-semibold tabular-nums", render: (order) => money(order.total_amount) },
    { key: "order_status", label: "Status", render: (order) => <AdminStatusBadge tone={order.order_status === "delivered" ? "success" : order.order_status === "pending_confirmation" ? "warning" : "muted"}>{order.order_status.replaceAll("_", " ")}</AdminStatusBadge> },
  ];
  return <AdminDataTable columns={columns} rows={orders} caption="Most recent persisted orders" emptyTitle="No persisted orders yet" emptyDescription="New orders will appear here when they are placed." />;
}

function ProductRows({ products, metric }) {
  if (!products?.length) return <p className="text-xs text-[var(--color-text-secondary)]">No completed sales in this period.</p>;
  return <div className="divide-y divide-[var(--color-border)]">
    {products.map((product, index) => <div key={`${product.productId ?? product.slug}-${index}`} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className="w-5 shrink-0 text-xs font-semibold text-[var(--color-text-secondary)]">{index + 1}</span>
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]">
        {product.image ? <Image src={product.image} alt="" fill unoptimized sizes="48px" className="object-cover" /> : <Package aria-hidden="true" className="absolute inset-0 m-auto h-5 w-5 text-[var(--color-primary)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-[var(--color-text)]">{product.name}</p>
        <p className="mt-0.5 text-[10px] text-[var(--color-text-secondary)]">{metric === "quantity" ? `${product.quantity.toLocaleString("en-EG")} units sold` : `${money(product.revenue)} net item revenue`}</p>
      </div>
      {product.slug && <Link href={`/products/${encodeURIComponent(product.slug)}`} className="hidden min-h-9 items-center rounded-full px-3 text-[10px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] sm:inline-flex">View</Link>}
    </div>)}
  </div>;
}

function ProductPerformance({ productsByQuantity, productsByRevenue, revenueAvailable, noSalesProducts, unavailable }) {
  if (unavailable || productsByQuantity == null) return <AdminEmptyState title="Product performance unavailable" description="Order-item snapshots could not be loaded safely for this date range." />;
  return <div className="space-y-5">
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Best by units sold</p>
      <ProductRows products={productsByQuantity} metric="quantity" />
    </div>
    <div className="border-t border-[var(--color-border)] pt-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Highest net item revenue</p>
      {revenueAvailable
        ? <ProductRows products={productsByRevenue} metric="revenue" />
        : <p className="text-[10px] leading-relaxed text-[var(--color-text-secondary)]">Unavailable: at least one discounted historical order has no item-level allocation snapshot, so its per-product net revenue cannot be reconstructed safely.</p>}
    </div>
    <div className="border-t border-[var(--color-border)] pt-4">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Active products with no delivered sales</p>
      {noSalesProducts == null
        ? <p className="text-[10px] text-[var(--color-text-secondary)]">This comparison is unavailable for the current catalog size or data range.</p>
        : noSalesProducts.length
          ? <div className="flex flex-wrap gap-2">{noSalesProducts.map((product) => <Link key={product.id} href={`/admin/products/${encodeURIComponent(product.slug)}`} className="max-w-full truncate rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1.5 text-[10px] font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-rose)] hover:text-[var(--color-primary)]">{product.name}</Link>)}</div>
          : <p className="text-xs text-[var(--color-text-secondary)]">All active products have delivered sales in this period, or no active products are listed.</p>}
      <p className="mt-2 text-[9px] text-[var(--color-text-secondary)]">No-sales status is factual for this range; no sales threshold is assumed.</p>
    </div>
  </div>;
}

function InventorySnapshot({ dashboard }) {
  const products = dashboard.outOfStockProducts ?? [];
  return <>
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <p className="text-[10px] font-semibold text-[var(--color-text-secondary)]">Out of stock</p>
        <p className="mt-2 font-editorial text-2xl font-bold">{dashboard.metrics.outOfStock == null ? "Unavailable" : dashboard.metrics.outOfStock.toLocaleString("en-EG")}</p>
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <p className="text-[10px] font-semibold text-[var(--color-text-secondary)]">Total stock units</p>
        <p className="mt-2 font-editorial text-2xl font-bold">Unavailable</p>
      </div>
    </div>
    <p className="mt-3 text-[10px] leading-relaxed text-[var(--color-text-secondary)]">Stock totals need a database aggregate. The schema has no low-stock threshold, so low-stock and restock alerts are not estimated.</p>
    {products.length > 0 && <div className="mt-4 space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Needs attention</p>
      {products.map((product) => <Link key={product.id} href="/admin/products" className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-2 text-xs hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
        <span className="truncate font-semibold">{product.name}</span><span className="shrink-0 text-[10px] text-[var(--color-rose)]">Out of stock</span>
      </Link>)}
    </div>}
    {dashboard.metrics.outOfStock === 0 && <p className="mt-4 text-xs text-[var(--color-text-secondary)]">No products are currently out of stock.</p>}
  </>;
}

function DashboardSection({ title, description, children, defaultOpen = false }) {
  return <details open={defaultOpen} className="group overflow-hidden rounded-[1.75rem] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
    <summary className="flex min-h-20 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 outline-none transition-colors hover:bg-[var(--color-background)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-rose)] sm:px-7 sm:py-5 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><h2 className="font-editorial text-2xl font-semibold text-[var(--color-text)] sm:text-3xl">{title}</h2><span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-secondary)]">{description}</span></span>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-primary)] transition-transform group-open:rotate-180"><ChevronDown aria-hidden="true" className="h-5 w-5" /></span>
    </summary>
    <div className="border-t border-[var(--color-border)] px-4 py-5 sm:px-7 sm:py-7">{children}</div>
  </details>;
}

function RankingPanel({ title, description, rows, mode = "orders", unavailable }) {
  return <AdminChartCard title={title} description={description}>
    {unavailable ? <AdminEmptyState title="Ranking unavailable" description={unavailable} /> : !rows?.length
      ? <AdminEmptyState title="No qualifying customers yet" description="Qualifying delivered orders will appear here when available." />
      : <ol className="divide-y divide-[var(--color-border)]">
        {rows.map((row) => <li key={`${row.rank}-${row.displayName}`} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0 sm:gap-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-primary-light)] font-editorial text-lg font-semibold text-[var(--color-primary)]">{row.rank}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text)]">{row.displayName}</span>
          <span className="shrink-0 text-right text-xs font-semibold tabular-nums text-[var(--color-text)]">{mode === "value" ? money(row.value) : `${(row.count ?? 0).toLocaleString("en-EG")} orders`}</span>
        </li>)}
      </ol>}
  </AdminChartCard>;
}

function UsersSection({ dashboard }) {
  const analytics = dashboard.userAnalytics;
  const unavailable = dashboard.userAnalyticsError;
  const stats = [
    { label: "Total customers", value: analytics?.totalUsers ?? null, icon: Users, definition: "Registered customer accounts, excluding administrator accounts." },
    { label: "Unique visitors today", value: analytics?.visitorsToday ?? null, icon: Users, definition: "First-party anonymous browsers seen today in Cairo time." },
    { label: "Unique visitors MTD", value: analytics?.visitorsMtd ?? null, icon: Users, definition: "Distinct first-party anonymous browsers since the Cairo month began." },
    { label: "New customers · 7 days", value: analytics?.newUsers ?? null, icon: Users, definition: "Customer accounts created in the rolling seven-day window." },
  ];
  const snapshots = analytics?.monthlyVisitorHistory ?? [];
  return <div className="space-y-6">
    {unavailable && <p role="alert" className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3 text-xs text-[var(--color-text)]">{unavailable}</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-4">{stats.map((stat) => <AdminStatCard key={stat.label} {...stat} comparison={false} unavailableNote={stat.value == null ? "Data unavailable" : "Current snapshot"} />)}</div>
    {analytics?.trackingUnavailableReason && <p role="status" className="text-xs leading-relaxed text-[var(--color-text-secondary)]">{analytics.trackingUnavailableReason} Visitor counts represent first-party anonymous browsers, not page views or verified individuals.</p>}
    <div className="grid min-w-0 gap-5 xl:grid-cols-2">
      <RankingPanel title="Top 5 Buyers" description="Ranked by qualifying delivered customer orders. Cancelled orders are excluded; unpaid delivered COD remains a delivered buyer order." rows={analytics?.topBuyers} unavailable={unavailable} />
      <RankingPanel title="DR. Beauty Elites" description="Top customers by delivered orders marked paid. Refunded orders and pending COD are excluded from collected purchase value." rows={analytics?.elites} mode="value" unavailable={unavailable} />
    </div>
    <AdminRankingVisibility settings={dashboard.rankingVisibilitySettings} />
    <p className="text-[10px] leading-relaxed text-[var(--color-text-secondary)]">{analytics?.historyNote ?? "Rankings use retained delivered order history recorded at rollout. Older orders removed under 45-day retention cannot be reconstructed."}</p>
    {snapshots.length > 0 && <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-5">
      <h3 className="font-editorial text-lg font-semibold text-[var(--color-text)]">Closed-month visitor snapshots</h3>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Final distinct-browser totals are retained after each Cairo month closes.</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{snapshots.slice(0, 6).map((snapshot) => <li key={snapshot.month_start} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs"><span>{new Intl.DateTimeFormat("en-EG", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${snapshot.month_start}T00:00:00Z`))}</span><strong className="tabular-nums">{Number(snapshot.unique_visitors).toLocaleString("en-EG")}</strong></li>)}</ul>
    </div>}
  </div>;
}

function discountValueLabel(promotion) {
  const value = Number(promotion.discount_value);
  return promotion.discount_type === "percentage" ? `${value}% off` : `${money(value)} off`;
}

function AnnouncementsSection({ dashboard }) {
  return <div className="space-y-5">
    {dashboard.announcementsError
      ? <AdminEmptyState title="Live discount announcements unavailable" description="The public announcement summary could not be loaded." />
      : dashboard.announcements?.length
        ? <div className="space-y-3">{dashboard.announcements.map((announcement) => <article key={announcement.code} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:px-5">
    <div className="min-w-0"><p className="text-xs font-semibold text-[var(--color-text-secondary)]">Storefront announcement</p><p className="mt-1 break-words font-mono text-sm font-bold tracking-wide text-[var(--color-text)]">{announcement.code}</p></div>
    <div className="text-right"><p className="text-sm font-semibold text-[var(--color-primary)]">{discountValueLabel(announcement)}</p><p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">Minimum {money(announcement.minimum_subtotal)}</p></div>
  </article>)}</div>
        : <AdminEmptyState title="No live discount announcements" description="Eligible discount announcements shown on the storefront will appear here." />}
    <AdminAnnouncementComposer channelUrl={dashboard.whatsappChannelUrl} />
  </div>;
}

function CairoRevenueOverview({ metrics, asOf }) {
  const data = metrics.cairoRevenue;
  if (!data) return <AdminEmptyState title="Cairo revenue metrics unavailable" description="Apply the local Cairo revenue analytics migration before relying on these metrics." />;
  const period = getCairoVisitorPeriod(asOf);
  const monthName = new Intl.DateTimeFormat("en-EG", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(period.today.year, period.today.month - 1, 1)));
  const todayLabel = new Intl.DateTimeFormat("en-EG", { month: "long", day: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(period.today.year, period.today.month - 1, period.today.day)));
  const monthContext = `Since ${monthName} 1`;
  const stats = [
    ["Total Orders", data.totalOrders, "number", "Current non-cancelled order history.", "Current history"],
    ["Today's Orders", data.todayOrders, "number", "Non-cancelled orders placed today.", todayLabel],
    ["Orders This Month", data.mtdOrders, "number", "Non-cancelled orders placed this month.", monthContext],
    ["Today's Revenue", data.todayDeliveredValue, "currency", "Delivered value; includes pending COD and excludes refunds.", todayLabel],
    ["Revenue This Month", data.mtdDeliveredValue, "currency", "Delivered value; includes pending COD and excludes refunds.", monthContext],
    ["Collected Revenue Today", data.todayCollectedRevenue, "currency", "Paid delivered orders only; pending COD is excluded.", todayLabel],
    ["Collected Revenue This Month", data.mtdCollectedRevenue, "currency", "Paid delivered orders only; pending COD is excluded.", monthContext],
    ["Discounts Used Today", data.todayDiscountUses, "number", "Redeemed offers recorded today.", todayLabel],
    ["Discounts Used This Month", data.mtdDiscountUses, "number", "Redeemed offers recorded this month.", monthContext],
    ["Discount Value Today", data.todayDiscountAmount, "currency", "Saved discount amounts from redeemed offers.", todayLabel],
    ["Discount Value This Month", data.mtdDiscountAmount, "currency", "Saved discount amounts from redeemed offers.", monthContext],
  ];
  return <div className="space-y-3">
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{stats.map(([label, value, format, definition, context]) => <AdminStatCard key={label} label={label} value={value} format={format} definition={definition} comparison={false} unavailableNote={context} />)}</div>
    <p className="text-[10px] leading-relaxed text-[var(--color-text-secondary)]">Revenue follows order date; discount value follows redemption date.</p>
  </div>;
}

export default function AdminDashboard({ dashboard, query = {} }) {
  if (dashboard.unavailable) return <p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">Dashboard data is unavailable until admin authorization and Supabase configuration are verified.</p>;
  if (dashboard.error) return <div role="alert" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">{dashboard.error}</div>;

  const { metrics, range } = dashboard;
  const stats = [
    { label: "Total revenue", value: metrics.totalRevenue, previousValue: metrics.previousRevenue, format: "currency", icon: CircleDollarSign, definition: "Delivered order value, including pending COD, excluding refunded orders." },
    { label: "Collected revenue", value: metrics.collectedRevenue, previousValue: metrics.previousCollectedRevenue, format: "currency", icon: CircleDollarSign, definition: "Delivered orders marked paid. Pending COD is excluded." },
    { label: "Orders in period", value: metrics.periodOrders, previousValue: metrics.previousPeriodOrders, icon: ShoppingCart, definition: "Orders created in the selected period, across all statuses." },
    { label: "Average order value", value: metrics.averageOrderValue, previousValue: metrics.previousAverageOrderValue, format: "currency", icon: ShoppingBag, definition: "Delivered, non-refunded order value divided by those orders." },
    { label: "Pending orders", value: metrics.pendingOrders, comparison: false, icon: ClipboardList, definition: "Orders currently awaiting confirmation.", unavailableNote: "Current unresolved orders" },
  ];

  const recentFrom = typeof query.from === "string" ? query.from : "";
  const recentTo = typeof query.to === "string" ? query.to : "";
  return <div className="mx-auto max-w-[1600px] space-y-6 sm:space-y-8">
    <AdminPageHeader
      eyebrow="DR. BEAUTY · BUSINESS OVERVIEW"
      title="Your store, at a glance"
      description="A clear view of sales, orders, catalog health, and customer activity. Financial metrics use the order and payment lifecycle recorded in the database."
      actions={<AdminDateRangeFilter range={range.range} from={recentFrom} to={recentTo} />}
    />

    {dashboard.rangeError && <p role="alert" className="rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3 text-xs text-[var(--color-text)]">{dashboard.rangeError}</p>}
    {dashboard.historyWarning && <p role="status" className="rounded-2xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-4 py-3 text-xs leading-relaxed text-[var(--color-text)]">Historical limitation: delivered and cancelled orders are removed by the 45-day retention policy. Results that reach beyond the retained order history can be incomplete.</p>}
    {dashboard.analyticsError && <p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-xs text-[var(--color-text-secondary)]">The selected range contains too many order records for this live calculation. Metrics are shown as unavailable instead of partial.</p>}

    <DashboardSection title="Users" description="Customer growth, first-party visitor activity, and consent-aware customer rankings." defaultOpen>
      <UsersSection dashboard={dashboard} />
    </DashboardSection>

    <DashboardSection title="Revenue" description="Orders, delivered revenue, payments received, and discount activity.">
    <div className="space-y-6">
    <CairoRevenueOverview metrics={metrics} asOf={dashboard.asOf} />
    <section aria-label="Revenue and order KPIs" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      {stats.map((stat) => <AdminStatCard key={stat.label} {...stat} />)}
    </section>

    <AdminChartCard title="Sales performance" description="Compare delivered revenue and order volume over the selected time range.">
      <AdminSalesChart series={dashboard.series} previousSeries={dashboard.previousSeries} range={range} rangeLabel={range.label} unavailable={dashboard.analyticsError} />
    </AdminChartCard>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(19rem,0.9fr)]">
      <AdminChartCard title="Order health" description={`Order outcomes created during ${range.label.toLowerCase()}.`}>
        <StatusDistribution counts={metrics.statusCounts} />
        <PendingOrdersPanel count={metrics.pendingOrders} orders={dashboard.pendingOrders} />
      </AdminChartCard>
      <AdminChartCard title="Inventory health" description="Current availability from the private inventory table." actions={<Link href="/admin/products" className="text-xs font-semibold text-[var(--color-primary)] hover:underline">Manage products</Link>}>
        <InventorySnapshot dashboard={dashboard} />
      </AdminChartCard>
    </div>

    <div className="grid gap-5 xl:grid-cols-2">
      <AdminChartCard title="Product performance" description={`Delivered, non-refunded items from ${range.label.toLowerCase()}. Quantities and net item values use immutable order-item snapshots.`} actions={<Link href="/admin/products" className="text-xs font-semibold text-[var(--color-primary)] hover:underline">Catalog</Link>}>
        <ProductPerformance productsByQuantity={dashboard.topProductsByQuantity} productsByRevenue={dashboard.topProductsByRevenue} revenueAvailable={dashboard.productRevenueAvailable} noSalesProducts={dashboard.noSalesProducts} unavailable={dashboard.itemAnalyticsError} />
      </AdminChartCard>
      <AdminChartCard title="Recent orders" description="Latest persisted order records, with no customer contact details shown." actions={<Link href="/admin/orders" className="text-xs font-semibold text-[var(--color-primary)] hover:underline">All orders</Link>}>
        <RecentOrders orders={dashboard.recentOrders} />
      </AdminChartCard>
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
      <AdminChartCard title="Recent activity" description="Order notifications, reviews, and customer requests.">
        <AdminActivityFeed activities={dashboard.recentActivity} partial={dashboard.activityPartial} limitation="Some recent activity sources could not be loaded." />
      </AdminChartCard>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <AdminCard className="flex items-center gap-3 p-4"><Package aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-primary)]" /><div><p className="text-[10px] text-[var(--color-text-secondary)]">Catalog products</p><p className="font-semibold">{metrics.products == null ? "Unavailable" : metrics.products.toLocaleString("en-EG")}</p></div></AdminCard>
      <AdminCard className="flex items-center gap-3 p-4"><Boxes aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-primary)]" /><div><p className="text-[10px] text-[var(--color-text-secondary)]">Categories</p><p className="font-semibold">{metrics.categories == null ? "Unavailable" : metrics.categories.toLocaleString("en-EG")}</p></div></AdminCard>
      <AdminCard className="flex items-center gap-3 p-4"><Star aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-primary)]" /><div><p className="text-[10px] text-[var(--color-text-secondary)]">Orders still retained</p><p className="font-semibold">{metrics.orders == null ? "Unavailable" : metrics.orders.toLocaleString("en-EG")}</p></div><Activity aria-hidden="true" className="ml-auto h-4 w-4 text-[var(--color-text-secondary)]" /></AdminCard>
    </div>
    </div>
    </DashboardSection>

    <DashboardSection title="Receipt Archive" description="Durable transaction snapshots, deletion safeguards, and export reminders.">
      <AdminReceiptArchiveSummary archive={dashboard.receiptArchive} error={dashboard.receiptArchiveError} />
    </DashboardSection>

    <DashboardSection title="Available Discounts" description="All configured promotions, including lifecycle state, targeting, real usage, and remaining capacity.">
      {dashboard.availablePromotionsError
        ? <AdminEmptyState title="Available discounts unavailable" description="The admin promotion list and redemption analytics could not be loaded." />
        : <AdminAvailableDiscounts promotions={dashboard.availablePromotions} asOf={new Date().toISOString()} />}
    </DashboardSection>

    <DashboardSection title="Announcements" description="Review live discount announcements or prepare a separate message for the WhatsApp Channel.">
      <AnnouncementsSection dashboard={dashboard} />
    </DashboardSection>
  </div>;
}
