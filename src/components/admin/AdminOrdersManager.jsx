"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import CustomSelect from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import OrderLifecycleControls from "@/components/admin/OrderLifecycleControls";
import WhatsAppAction from "@/components/whatsapp/WhatsAppAction";
import ConfirmationDialog from "@/components/ui/ConfirmationDialog";
import { deleteAdminOrder } from "@/app/admin/actions";
import { useToast } from "@/constants/ToastContext";
import { buildAdminOrdersPageHref } from "@/lib/admin-order-query.mjs";

const statusOptions = [
  { value: "all", label: "All order statuses" },
  { value: "pending_confirmation", label: "Pending confirmation" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

const pageSizeOptions = [10, 25, 50].map((value) => ({ value: String(value), label: `${value} per page` }));

function OrderDeleteAction({ order }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  function removeOrder() {
    if (isPending) return;
    startTransition(async () => {
      try {
        const result = await deleteAdminOrder(order.id);
        setIsConfirmOpen(false);
        showToast(result.message, result.ok ? "success" : "error");
        if (result.ok) router.refresh();
      } catch {
        setIsConfirmOpen(false);
        showToast("The order could not be deleted. Refresh and try again.", "error");
      }
    });
  }

  return (
    <div className="flex justify-end border-t border-[var(--color-border)] pt-4">
      <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => setIsConfirmOpen(true)} aria-label={`Permanently delete order ${order.order_number}`}>
        <Trash2 aria-hidden="true" className="h-4 w-4" /> {isPending ? "Deleting…" : "Delete order permanently"}
      </Button>
      {isConfirmOpen && <ConfirmationDialog
        title={`Delete order #${order.order_number} permanently?`}
        description="This permanently deletes the order and its item snapshots. Promotion redemption history will be retained. This action cannot be undone."
        confirmLabel="Delete order"
        pendingLabel="Deleting order…"
        isPending={isPending}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={removeOrder}
      />}
    </div>
  );
}

function OrderDetails({ order }) {
  return (
    <div className="space-y-5 border-t border-[var(--color-border)] px-4 pb-4 pt-5 sm:px-6">
      <div className="grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
          <h3 className="mb-2 font-bold">Customer</h3>
          <p>{order.customer_name}</p>
          <p>{order.customer_phone}</p>
          <p>{order.customer_email || "No email supplied"}</p>
          <WhatsAppAction className="mt-3" destination={order.customer_phone} templateId="admin.order_contact" variables={{ orderReference: order.order_number }} unavailableMessage="Customer contact requires a valid Egyptian or international phone number.">
            Contact Customer on WhatsApp
          </WhatsAppAction>
        </section>
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
          <h3 className="mb-2 font-bold">Delivery</h3>
          <p>{order.governorate}, {order.city}</p>
          <p>{order.address_line}</p>
          {order.delivery_notes && <p>Notes: {order.delivery_notes}</p>}
        </section>
      </div>

      <section aria-label={`Items in order ${order.order_number}`}>
        <h3 className="mb-2 text-xs font-bold">Items</h3>
        <div className="space-y-2 sm:hidden">
          {(order.items ?? []).map((item) => <article key={item.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-xs">
            <h4 className="break-words font-semibold">{item.product_name_snapshot}</h4>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[var(--color-text-secondary)]">
              <div><dt>Quantity</dt><dd className="font-medium text-[var(--color-text)]">{item.quantity}</dd></div>
              <div><dt>Unit price</dt><dd className="font-medium text-[var(--color-text)]">EGP {Number(item.unit_price).toFixed(2)}</dd></div>
              <div className="col-span-2 border-t border-[var(--color-border)] pt-2"><dt>Line total</dt><dd className="font-semibold text-[var(--color-text)]">EGP {Number(item.line_total).toFixed(2)}</dd></div>
            </dl>
          </article>)}
        </div>
        <div tabIndex={0} role="region" aria-label="Order item details; scroll horizontally to view all columns" className="hidden overflow-x-auto rounded-2xl border border-[var(--color-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] sm:block">
          <table className="w-full text-left text-xs">
            <thead><tr className="bg-[var(--color-background)] text-[var(--color-text-secondary)]"><th className="p-3">Product snapshot</th><th className="p-3">Quantity</th><th className="p-3">Unit price</th><th className="p-3">Line total</th></tr></thead>
            <tbody className="divide-y divide-[var(--color-border)]">{(order.items ?? []).map((item) => <tr key={item.id}><td className="p-3">{item.product_name_snapshot}</td><td className="p-3">{item.quantity}</td><td className="p-3">EGP {Number(item.unit_price).toFixed(2)}</td><td className="p-3">EGP {Number(item.line_total).toFixed(2)}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4" aria-label={`Status history for order ${order.order_number}`}>
        <h3 className="mb-3 font-bold">Order history</h3>
        {order.statusHistory === null ? <p role="status" className="text-[var(--color-text-secondary)]">Status history could not be loaded.</p> : order.statusHistory?.length ? <ol className="space-y-2">{order.statusHistory.map((event) => <li key={event.event_id} className="flex flex-col justify-between gap-1 border-l-2 border-[var(--color-rose)] pl-3 sm:flex-row sm:items-start"><span><span className="font-semibold">{event.from_status.replaceAll("_", " ")} → {event.to_status.replaceAll("_", " ")}</span>{event.to_status === "shipped" && event.tracking_number && <span className="block text-[var(--color-text-secondary)]">Tracking {event.tracking_number}{event.shipping_carrier ? ` · ${event.shipping_carrier}` : ""}</span>}</span><time className="text-[var(--color-text-secondary)]" dateTime={event.changed_at}>{new Date(event.changed_at).toLocaleString("en-EG")}</time></li>)}</ol> : <p className="text-[var(--color-text-secondary)]">No status changes have been recorded yet.</p>}
      </section>

      <div className="flex flex-wrap justify-end gap-x-6 gap-y-2 border-t border-[var(--color-border)] pt-4 text-xs">
        <span>Subtotal: <b>EGP {Number(order.subtotal).toFixed(2)}</b></span>
        <span>Shipping fee: <b>EGP {Number(order.shipping_fee_amount ?? order.shipping_amount).toFixed(2)}</b></span>
        {Number(order.shipping_discount_amount) > 0 && <span>Shipping discount: <b>− EGP {Number(order.shipping_discount_amount).toFixed(2)}</b></span>}
        <span>Discount: <b>EGP {Number(order.discount_amount).toFixed(2)}</b></span>
        <span className="text-sm">Total: <b>EGP {Number(order.total_amount).toFixed(2)}</b></span>
      </div>
      <OrderLifecycleControls key={`${order.id}-${order.order_status}`} order={order} />
      <OrderDeleteAction order={order} />
    </div>
  );
}

export default function AdminOrdersManager({ orders, filters, pagination, historyUnavailable = false }) {
  const [status, setStatus] = useState(filters.status);
  const [pageSize, setPageSize] = useState(String(pagination.pageSize));
  const pageFilters = { ...filters, pageSize: pagination.pageSize };
  const firstOrder = pagination.totalCount === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const lastOrder = Math.min(pagination.page * pagination.pageSize, pagination.totalCount);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-primary)]">Store management</p>
        <h1 className="mt-2 font-editorial text-3xl font-bold text-[var(--color-text)]">Persisted Orders</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Search and filter the complete order history. Expand an order for customer, delivery, items, and lifecycle actions.</p>
      </header>

      {historyUnavailable && <p role="status" className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-secondary)]">Order status history could not be loaded. Refresh the page or check the server diagnostic code.</p>}

      <form action="/admin/orders" method="get" className="grid gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:grid-cols-2 sm:p-5 xl:grid-cols-4">
        <label className="grid min-w-0 gap-2 text-xs font-semibold text-[var(--color-text-secondary)] sm:col-span-2 xl:col-span-2">
          <span>Search all orders</span>
          <input name="q" defaultValue={filters.search} maxLength={80} placeholder="Exact order number, customer, or phone" className="min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20" />
        </label>
        <label className="grid min-w-0 gap-2 text-xs font-semibold text-[var(--color-text-secondary)]">
          <span>Order status</span>
          <CustomSelect id="order-status-filter" ariaLabel="Order status" options={statusOptions} value={status} onChange={setStatus} />
          <input type="hidden" name="status" value={status} />
        </label>
        <div className="grid min-w-0 gap-2 text-xs font-semibold text-[var(--color-text-secondary)]">
          <span>Page size</span>
          <CustomSelect id="order-page-size" ariaLabel="Orders per page" options={pageSizeOptions} value={pageSize} onChange={setPageSize} />
          <input type="hidden" name="pageSize" value={pageSize} />
        </div>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 xl:col-span-4">
          <Button type="submit" variant="primary" size="md">Apply filters</Button>
          <Link href="/admin/orders" className="inline-flex min-h-11 items-center px-2 text-sm font-semibold text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">Clear filters</Link>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--color-text-secondary)]" aria-live="polite">
        <p>{pagination.totalCount === 0 ? "No matching orders" : `Showing ${firstOrder}–${lastOrder} of ${pagination.totalCount.toLocaleString("en-EG")} orders`}</p>
        {pagination.totalPages > 1 && <nav aria-label="Order pages" className="flex items-center gap-2">
          {pagination.page > 1
            ? <Link href={buildAdminOrdersPageHref(pageFilters, pagination.page - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 text-[var(--color-text)] hover:bg-[var(--color-surface)]"><ChevronLeft className="h-4 w-4" /> Previous</Link>
            : <span aria-disabled="true" className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 opacity-50"><ChevronLeft className="h-4 w-4" /> Previous</span>}
          <span className="px-1">Page {pagination.page} of {pagination.totalPages}</span>
          {pagination.page < pagination.totalPages
            ? <Link href={buildAdminOrdersPageHref(pageFilters, pagination.page + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 text-[var(--color-text)] hover:bg-[var(--color-surface)]">Next <ChevronRight className="h-4 w-4" /></Link>
            : <span aria-disabled="true" className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 opacity-50">Next <ChevronRight className="h-4 w-4" /></span>}
        </nav>}
      </div>

      {orders.length === 0 ? <div className="rounded-3xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center text-sm text-[var(--color-text-secondary)]">{pagination.totalCount ? "No orders are available on this page." : "No persisted orders match these filters."}</div> : <div className="space-y-3">
        {orders.map((order) => <article key={order.id} id={`order-${order.order_number}`} className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <details>
            <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 outline-none marker:hidden hover:bg-[var(--color-background)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-rose)] sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 className="font-editorial text-lg font-bold">Order #{order.order_number}</h2><span className="rounded-full border border-[var(--color-primary)] bg-[var(--color-primary-light)] px-3 py-1 text-[10px] font-semibold capitalize text-[var(--color-primary)]">{order.order_status.replaceAll("_", " ")}</span></div>
                <p className="mt-1 break-words text-xs text-[var(--color-text-secondary)]">{new Date(order.created_at).toLocaleString("en-EG")} · {order.customer_name}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
                <span className="text-xs text-[var(--color-text-secondary)]">Payment: {order.payment_status} · COD</span>
                <span className="font-editorial text-base font-bold text-[var(--color-text)]">EGP {Number(order.total_amount).toFixed(2)}</span>
                <span className="text-xs font-semibold text-[var(--color-primary)]">Order details</span>
              </div>
            </summary>
            <OrderDetails order={order} />
          </details>
        </article>)}
      </div>}

      {pagination.totalPages > 1 && <nav aria-label="Order pages bottom" className="flex flex-wrap items-center justify-center gap-3 border-t border-[var(--color-border)] pt-4">
        {pagination.page > 1 && <Link href={buildAdminOrdersPageHref(pageFilters, pagination.page - 1)} className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm font-semibold">Previous</Link>}
        <span className="text-sm text-[var(--color-text-secondary)]">Page {pagination.page} of {pagination.totalPages}</span>
        {pagination.page < pagination.totalPages && <Link href={buildAdminOrdersPageHref(pageFilters, pagination.page + 1)} className="min-h-11 rounded-lg border border-[var(--color-border)] px-4 py-3 text-sm font-semibold">Next</Link>}
      </nav>}
    </div>
  );
}
