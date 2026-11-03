import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";

const STATUS_LABELS = {
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-EG", { year: "numeric", month: "short", day: "numeric" });
}

function formatAmount(value, currency) {
  const amount = Number(value);
  return Number.isFinite(amount) ? new Intl.NumberFormat("en-EG", { style: "currency", currency }).format(amount) : "Amount unavailable";
}

function PageMessage({ title, children, role = "status" }) {
  return <main className="container section"><section className="mx-auto max-w-3xl rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8"><h1 className="section-heading">{title}</h1><p role={role} className="section-description">{children}</p><Link href="/" className="mt-5 inline-block text-sm font-semibold text-[var(--color-primary)] hover:underline">Return to Dr. Beauty</Link></section></main>;
}

async function OrderHistoryContent() {
  await connection();
  const missing = getMissingSupabaseEnv();
  if (missing.length) return <PageMessage title="My Orders" role="alert">Order history needs Supabase configuration. Missing: {missing.join(", ")}.</PageMessage>;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect(`/login?next=${encodeURIComponent("/orders")}`);

  const { data: orders, error } = await supabase
    .from("orders")
    .select("order_number,created_at,order_status,currency,total_amount")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return <PageMessage title="My Orders" role="alert">Your orders are temporarily unavailable. Please try again later.</PageMessage>;

  return (
    <main className="container section">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="section-heading">My Orders</h1><p className="section-description">Review your recent purchases and delivery progress.</p></div>
        <Link href="/profile" className="text-sm font-medium text-[var(--color-primary)] hover:underline">Back to account</Link>
      </header>

      {!orders?.length ? (
        <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm sm:p-10">
          <h2 className="font-editorial text-xl font-bold">No orders yet</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Your completed checkouts will appear here.</p>
          <Link href="/shop" className="mt-5 inline-flex rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white">Explore the store</Link>
        </section>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <article key={order.order_number} className="flex flex-col justify-between gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:flex-row sm:items-center sm:p-6">
              <div className="space-y-1">
                <h2 className="font-editorial text-lg font-bold">Order #{order.order_number}</h2>
                <p className="text-xs text-[var(--color-text-secondary)]">Placed {formatDate(order.created_at)}</p>
                <span className="inline-flex rounded-full border border-[var(--color-border)] px-3 py-1 text-[10px] font-medium">{STATUS_LABELS[order.order_status] ?? "Status unavailable"}</span>
              </div>
              <div className="flex items-center justify-between gap-4 sm:justify-end">
                <p className="text-sm font-semibold">{formatAmount(order.total_amount, order.currency)}</p>
                <Link href={`/orders/${encodeURIComponent(String(order.order_number))}`} className="rounded-full border border-[var(--color-border)] px-4 py-2 text-xs font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-background)]">View details</Link>
              </div>
            </article>
          ))}
          {orders.length === 100 && <p className="text-center text-xs text-[var(--color-text-secondary)]">Showing your 100 most recent orders.</p>}
        </div>
      )}
    </main>
  );
}

function OrderHistoryFallback() {
  return <main className="container section"><p role="status" className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-secondary)]">Loading your orders…</p></main>;
}

export default function OrderHistoryPage() {
  return <Suspense fallback={<OrderHistoryFallback />}><OrderHistoryContent /></Suspense>;
}
