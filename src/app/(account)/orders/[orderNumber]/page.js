import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import WhatsAppAction from "@/components/whatsapp/WhatsAppAction";

const STATUS_LABELS = {
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function formatDate(value, withTime = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleString("en-EG", withTime
    ? { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC" }
    : { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

function formatAmount(value, currency) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en-EG", { style: "currency", currency }).format(amount)
    : "Amount unavailable";
}

function safeTrackingHref(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function PageMessage({ title, children, role = "status" }) {
  return (
    <main className="container section">
      <section className="mx-auto max-w-3xl rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">Your order</p>
        <h1 className="section-heading">{title}</h1>
        <p role={role} className="section-description">{children}</p>
        <Link href="/orders" className="mt-5 inline-flex min-h-10 items-center text-sm font-semibold text-[var(--color-primary)] hover:underline">Back to my orders</Link>
      </section>
    </main>
  );
}

function OrderDetailsFallback() {
  return (
    <main className="container section" aria-busy="true">
      <div className="mx-auto max-w-5xl animate-pulse space-y-5 motion-reduce:animate-none">
        <div className="h-4 w-28 rounded bg-[var(--color-primary-light)]" />
        <div className="h-10 w-64 rounded bg-[var(--color-primary-light)]" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <div className="h-72 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]" />
          <div className="h-52 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]" />
        </div>
        <p role="status" className="text-sm text-[var(--color-text-secondary)]">Loading your order details...</p>
      </div>
    </main>
  );
}

async function OrderDetailsContent({ params }) {
  // Supabase Auth validates cookie-backed JWT expiry using the current time.
  // Defer this authenticated receipt subtree until a request rather than
  // evaluating Auth's time-dependent check during prerendering.
  await connection();
  const { orderNumber } = await params;
  const missing = getMissingSupabaseEnv();
  if (missing.length) {
    return <PageMessage title="Order details unavailable" role="alert">Order details need Supabase configuration. Missing: {missing.join(", ")}.</PageMessage>;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect(`/login?next=${encodeURIComponent(`/orders/${orderNumber}`)}`);

  if (!/^[1-9]\d{0,18}$/.test(orderNumber) || BigInt(orderNumber) > 9223372036854775807n) {
    return <PageMessage title="Order not found">We could not find that order in your account.</PageMessage>;
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select("order_number,created_at,order_status,payment_method,payment_status,currency,subtotal,shipping_amount,shipping_fee_amount,shipping_discount_amount,discount_amount,total_amount,customer_name,customer_email,customer_phone,governorate,city,address_line,delivery_notes,shipping_carrier,tracking_number,tracking_url,shipped_at,items:order_items(product_name_snapshot,product_slug_snapshot,unit_price,quantity,line_total)")
    .eq("user_id", user.id)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) return <PageMessage title="Order details unavailable" role="alert">Order details are temporarily unavailable. Please try again later.</PageMessage>;
  if (!order) return <PageMessage title="Order not found">We could not find that order in your account.</PageMessage>;

  const trackingHref = safeTrackingHref(order.tracking_url);

  return (
    <main className="container section">
      <div className="mx-auto max-w-5xl">
        <Link href="/orders" className="inline-flex min-h-10 items-center text-sm font-semibold text-[var(--color-primary)] hover:underline">Back to orders</Link>
        <header className="mb-7 mt-4 flex flex-col justify-between gap-4 border-b border-[var(--color-border)] pb-6 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">Order receipt</p>
            <h1 className="font-editorial text-3xl font-medium sm:text-4xl">Order #{order.order_number}</h1>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Placed {formatDate(order.created_at)}</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-semibold capitalize">
            {STATUS_LABELS[order.order_status] ?? "Status unavailable"}
          </span>
        </header>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
          <div className="space-y-5">
            <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7" aria-labelledby="items-heading">
              <div className="mb-5 flex items-baseline justify-between gap-3">
                <h2 id="items-heading" className="font-editorial text-xl font-semibold">Your items</h2>
                <span className="text-xs text-[var(--color-text-secondary)]">{order.items?.length ?? 0} {order.items?.length === 1 ? "item" : "items"}</span>
              </div>
              {!order.items?.length ? (
                <p className="text-sm text-[var(--color-text-secondary)]">No item snapshots are available for this order.</p>
              ) : (
                <div className="divide-y divide-[var(--color-border)]">
                  {order.items.map((item, index) => (
                    <div key={`${item.product_slug_snapshot}-${index}`} className="flex flex-col justify-between gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                      <div>
                        <h3 className="font-semibold">{item.product_name_snapshot}</h3>
                        <p className="text-xs text-[var(--color-text-secondary)]">Qty {item.quantity} · {formatAmount(item.unit_price, order.currency)} each</p>
                      </div>
                      <p className="text-sm font-semibold">{formatAmount(item.line_total, order.currency)}</p>
                    </div>
                  ))}
                </div>
              )}
              <dl className="mt-5 space-y-2 border-t border-[var(--color-border)] pt-4 text-sm">
                <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-secondary)]">Subtotal</dt><dd>{formatAmount(order.subtotal, order.currency)}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-secondary)]">Delivery fee</dt><dd>{formatAmount(order.shipping_fee_amount ?? order.shipping_amount, order.currency)}</dd></div>
                {Number(order.shipping_discount_amount) > 0 && <div className="flex justify-between gap-4 text-[var(--color-success)]"><dt>Shipping discount</dt><dd>−{formatAmount(order.shipping_discount_amount, order.currency)}</dd></div>}
                <div className="flex justify-between gap-4"><dt className="text-[var(--color-text-secondary)]">Discount</dt><dd>−{formatAmount(order.discount_amount, order.currency)}</dd></div>
                <div className="flex justify-between gap-4 border-t border-[var(--color-border)] pt-3 text-base font-bold"><dt>Total</dt><dd>{formatAmount(order.total_amount, order.currency)}</dd></div>
              </dl>
            </section>

            <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7" aria-labelledby="delivery-heading">
              <h2 id="delivery-heading" className="mb-4 font-editorial text-xl font-semibold">Delivery details</h2>
              <address className="space-y-1 text-sm not-italic">
                <p className="font-medium">{order.customer_name}</p>
                <p>{order.customer_phone}</p>
                {order.customer_email && <p>{order.customer_email}</p>}
                <p className="pt-2">{order.governorate}, {order.city}</p>
                <p>{order.address_line}</p>
                {order.delivery_notes && <p className="pt-2 text-[var(--color-text-secondary)]">Delivery notes: {order.delivery_notes}</p>}
              </address>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7" aria-labelledby="tracking-heading">
              <h2 id="tracking-heading" className="mb-4 font-editorial text-xl font-semibold">Shipment tracking</h2>
              {order.tracking_number || order.shipping_carrier || trackingHref || order.shipped_at ? (
                <dl className="space-y-3 text-sm">
                  {order.shipping_carrier && <div><dt className="text-xs text-[var(--color-text-secondary)]">Carrier</dt><dd className="font-medium">{order.shipping_carrier}</dd></div>}
                  {order.tracking_number && <div><dt className="text-xs text-[var(--color-text-secondary)]">Tracking number</dt><dd className="font-medium">{order.tracking_number}</dd></div>}
                  {order.shipped_at && <div><dt className="text-xs text-[var(--color-text-secondary)]">Shipped</dt><dd className="font-medium">{formatDate(order.shipped_at, true)}</dd></div>}
                  {trackingHref && <div><a href={trackingHref} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center font-semibold text-[var(--color-primary)] underline">Open secure tracking page</a></div>}
                </dl>
              ) : <p className="text-sm text-[var(--color-text-secondary)]">Tracking details will appear here when shipment information is available.</p>}
            </section>
            <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7" aria-labelledby="payment-heading">
              <h2 id="payment-heading" className="mb-3 font-editorial text-xl font-semibold">Payment</h2>
              <p className="text-sm">{order.payment_method === "cod" ? "Cash on delivery" : order.payment_method}</p>
              <p className="mt-1 text-xs capitalize text-[var(--color-text-secondary)]">{order.payment_status}</p>
              <WhatsAppAction className="mt-4" templateId="order.status" variables={{ orderReference: order.order_number }} >Ask About This Order</WhatsAppAction>
              <details className="mt-4 rounded-2xl border border-[var(--color-border)] p-4">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">More order support options</summary>
                <div className="mt-4 flex flex-wrap gap-3">
                  <WhatsAppAction templateId="order.confirmation" variables={{ orderReference: order.order_number }}>Ask About Confirmation</WhatsAppAction>
                  <WhatsAppAction templateId="order.existing" variables={{ orderReference: order.order_number }}>General order question</WhatsAppAction>
                  <WhatsAppAction templateId="order.change" variables={{ orderReference: order.order_number }}>Ask about a change</WhatsAppAction>
                  <WhatsAppAction templateId="order.cancel" variables={{ orderReference: order.order_number }}>Ask about cancellation</WhatsAppAction>
                  <WhatsAppAction templateId="order.delivery" variables={{ orderReference: order.order_number }}>Report a delivery issue</WhatsAppAction>
                  <WhatsAppAction templateId="order.item_issue" variables={{ orderReference: order.order_number }}>Report an item issue</WhatsAppAction>
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-secondary)]">WhatsApp opens a prepared message for you to review and send. No message is sent automatically.</p>
              </details>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}

export default function OrderDetailsPage({ params }) {
  return (
    <Suspense fallback={<OrderDetailsFallback />}>
      <OrderDetailsContent params={params} />
    </Suspense>
  );
}
