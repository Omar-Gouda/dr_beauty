import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, Layers3, Package, Plus, ShoppingCart, Boxes } from "lucide-react";
import { getAdminDashboardData } from "@/lib/admin";
import AdminPageLoading from "@/components/admin/AdminPageLoading";

function MetricCard({ label, value, icon: Icon }) {
  return <div className="flex flex-col justify-between rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-6">
    <div className="mb-4 flex items-center justify-between"><span className="text-xs font-semibold text-[var(--color-text-secondary)]">{label}</span><div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-[var(--color-primary)]"><Icon className="h-5 w-5" /></div></div>
    <span className="font-editorial text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{value == null ? "Unavailable" : value.toLocaleString("en-EG")}</span>
  </div>;
}

async function AdminDashboardContent() {
  const dashboard = await getAdminDashboardData();
  if (dashboard.unavailable) return <p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">Dashboard data is unavailable until admin authorization and Supabase configuration are verified.</p>;

  const { metrics, recentOrders } = dashboard;
  const stats = [
    { label: "Total Products", value: metrics.products, icon: Package },
    { label: "Active Products", value: metrics.active, icon: Package },
    { label: "Inactive Products", value: metrics.inactive, icon: Package },
    { label: "Categories", value: metrics.categories, icon: Layers3 },
    { label: "Units in Stock", value: metrics.stock, icon: Boxes },
    { label: "Persisted Orders", value: metrics.orders, icon: ShoppingCart },
  ];
  const statusLabels = [
    ["Pending confirmation", metrics.statuses.pending], ["Confirmed", metrics.statuses.confirmed],
    ["Processing", metrics.statuses.processing], ["Shipped", metrics.statuses.shipped],
    ["Delivered", metrics.statuses.delivered], ["Cancelled", metrics.statuses.cancelled],
  ];

  return <div className="space-y-8">
    <div className="flex flex-col items-start justify-between gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:flex-row sm:items-center sm:gap-6 sm:p-8">
      <div><h2 className="mb-2 font-editorial text-2xl font-bold sm:text-3xl">Store Overview</h2><p className="text-xs text-[var(--color-text-secondary)] sm:text-sm">Live catalog, inventory, and order records from Supabase.</p></div>
      <Link href="/admin/products" className="inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-6 py-3 text-xs font-semibold text-white shadow-md"><Plus className="h-4 w-4" /> Manage Products</Link>
    </div>

    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">{stats.map((stat) => <MetricCard key={stat.label} {...stat} />)}</div>

    <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-8">
      <h3 className="mb-5 font-editorial text-xl font-bold">Order Status Overview</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{statusLabels.map(([label, value]) => <div key={label} className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 sm:p-4"><p className="break-words text-[10px] text-[var(--color-text-secondary)]">{label}</p><p className="mt-2 text-lg font-bold">{value == null ? "Unavailable" : value.toLocaleString("en-EG")}</p></div>)}</div>
    </section>

    <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-8">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 sm:mb-6"><h3 className="min-w-0 break-words font-editorial text-xl font-bold">Recent Persisted Orders</h3><Link href="/admin/orders" className="flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:underline">View All <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
      {recentOrders == null ? <p role="status" className="text-sm text-[var(--color-text-secondary)]">Order records are unavailable.</p> : recentOrders.length === 0 ? <p className="text-sm text-[var(--color-text-secondary)]">No persisted orders yet.</p> : <div className="space-y-3">{recentOrders.map((order) => <div key={order.id} className="flex min-w-0 flex-col justify-between gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:flex-row sm:items-center"><div className="min-w-0"><p className="break-words font-semibold">Order #{order.order_number} · {order.customer_name}</p><p className="break-words text-[10px] text-[var(--color-text-secondary)]">{new Date(order.created_at).toLocaleString("en-EG")} · {order.customer_phone}</p></div><div className="flex flex-wrap items-center gap-2 text-sm font-bold">EGP {Number(order.total_amount).toFixed(2)} <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-[10px] font-medium">{order.order_status.replaceAll("_", " ")}</span></div></div>)}</div>}
    </section>
  </div>;
}

export default function AdminDashboardPage() {
  return <Suspense fallback={<AdminPageLoading variant="dashboard" />}><AdminDashboardContent /></Suspense>;
}
