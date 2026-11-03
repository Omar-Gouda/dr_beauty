"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markCodPaymentCollected, transitionAdminOrderStatus } from "@/app/admin/actions";
import CustomSelect from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { canCollectCodPayment } from "@/lib/admin-order-status.mjs";
import WhatsAppAction from "@/components/whatsapp/WhatsAppAction";

const NEXT_STATUSES = {
  pending_confirmation: [{ value: "confirmed", label: "Confirm order" }, { value: "cancelled", label: "Cancel order" }],
  confirmed: [{ value: "processing", label: "Move to processing" }, { value: "cancelled", label: "Cancel order" }],
  processing: [{ value: "shipped", label: "Mark shipped" }, { value: "cancelled", label: "Cancel order" }],
  shipped: [{ value: "delivered", label: "Delivered" }],
};

export default function OrderLifecycleControls({ order }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const configuredChoices = NEXT_STATUSES[order.order_status] ?? [];
  const missingShipmentData = order.order_status === "shipped" && !order.tracking_number;
  const choices = missingShipmentData ? [] : configuredChoices;
  const [nextStatus, setNextStatus] = useState(choices[0]?.value ?? "");
  const [feedback, setFeedback] = useState(null);
  const [whatsappFallbackUrl, setWhatsappFallbackUrl] = useState(null);
  const [whatsappOpened, setWhatsappOpened] = useState(false);
  const whatsappPopupRef = useRef(null);
  const [isPaymentPending, startPaymentTransition] = useTransition();
  const [paymentFeedback, setPaymentFeedback] = useState(null);

  function handleSubmit(event) {
    event.preventDefault();
    if (isPending || !nextStatus) return;

    const formData = new FormData(event.currentTarget);
    setFeedback(null);
    setWhatsappFallbackUrl(null);
    setWhatsappOpened(false);
    let popup = null;
    try {
      popup = window.open("about:blank", "_blank");
      if (popup) {
        popup.opener = null;
        whatsappPopupRef.current = popup;
      }
    } catch {
      whatsappPopupRef.current = null;
    }
    startTransition(async () => {
      let result;
      try {
        result = await transitionAdminOrderStatus(formData);
      } catch {
        result = { ok: false, message: "The order update could not be confirmed. Refresh and check its status before retrying." };
      }
      setFeedback(result);
      if (result.ok && result.whatsappUrl) {
        if (popup && !popup.closed) {
          try {
            popup.location.replace(result.whatsappUrl);
            whatsappPopupRef.current = null;
            setWhatsappOpened(true);
            router.refresh();
          } catch {
            try { popup.close(); } catch { /* The order update already succeeded. */ }
            whatsappPopupRef.current = null;
            setWhatsappFallbackUrl(result.whatsappUrl);
          }
        } else {
          whatsappPopupRef.current = null;
          setWhatsappFallbackUrl(result.whatsappUrl);
        }
      } else {
        try { popup?.close(); } catch { /* Popup cleanup must not affect the order result. */ }
        whatsappPopupRef.current = null;
        if (result.ok) router.refresh();
      }
    });
  }

  function handlePaymentSubmit(event) {
    event.preventDefault();
    if (isPaymentPending) return;
    const formData = new FormData(event.currentTarget);
    setPaymentFeedback(null);
    startPaymentTransition(async () => {
      const result = await markCodPaymentCollected(formData);
      setPaymentFeedback(result);
      if (result.ok) router.refresh();
    });
  }

  const shipmentUrlIsSafe = typeof order.tracking_url === "string" && /^https:\/\//i.test(order.tracking_url);

  return (
    <section className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-xs">
      <div>
        <h4 className="mb-2 font-bold">Shipment tracking</h4>
        {order.tracking_number ? (
          <dl className="grid gap-1 text-[var(--color-text-secondary)] sm:grid-cols-2">
            <div><dt className="inline font-semibold text-[var(--color-text)]">Carrier: </dt><dd className="inline">{order.shipping_carrier || "Not specified"}</dd></div>
            <div><dt className="inline font-semibold text-[var(--color-text)]">Tracking number: </dt><dd className="inline">{order.tracking_number}</dd></div>
            {order.shipped_at && <div><dt className="inline font-semibold text-[var(--color-text)]">Shipped: </dt><dd className="inline">{new Date(order.shipped_at).toLocaleString("en-EG")}</dd></div>}
            {shipmentUrlIsSafe && <div><a className="font-semibold text-[var(--color-primary)] underline" href={order.tracking_url} target="_blank" rel="noopener noreferrer">Open tracking page</a></div>}
          </dl>
        ) : <p className="text-[var(--color-text-secondary)]">Shipment details have not been added.</p>}
      </div>

      {choices.length > 0 ? (
        <form className="space-y-3 border-t border-[var(--color-border)] pt-4" onSubmit={handleSubmit}>
          <input type="hidden" name="orderId" value={order.id} />
          <input type="hidden" name="newStatus" value={nextStatus} />
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="block space-y-1.5">
              <span className="font-semibold">Next status</span>
              <CustomSelect options={choices} value={nextStatus} onChange={setNextStatus} disabled={isPending} placeholder="Choose next status" />
            </label>
              <Button type="submit" disabled={isPending}>
              {isPending ? "Updating..." : nextStatus === "confirmed" ? "Confirm order" : nextStatus === "cancelled" ? "Cancel order" : "Update status"}
            </Button>
          </div>

          {nextStatus === "shipped" && (
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1.5"><span className="font-semibold">Carrier <span className="font-normal text-[var(--color-text-secondary)]">(optional)</span></span><input name="shippingCarrier" maxLength={120} autoComplete="organization" disabled={isPending} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5" /></label>
              <label className="space-y-1.5"><span className="font-semibold">Tracking number</span><input name="trackingNumber" required maxLength={160} disabled={isPending} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5" /></label>
              <label className="space-y-1.5"><span className="font-semibold">HTTPS tracking URL <span className="font-normal text-[var(--color-text-secondary)]">(optional)</span></span><input name="trackingUrl" type="url" maxLength={2048} inputMode="url" disabled={isPending} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5" /></label>
            </div>
          )}

          {nextStatus === "cancelled" && <p className="text-[var(--color-text-secondary)]">Cancelling restores this order&apos;s reserved inventory, subject to the existing lifecycle checks.</p>}

          {feedback && <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "text-[var(--color-primary)]" : "text-red-700"}>{feedback.message}</p>}
          {whatsappOpened && <p role="status" className="text-[var(--color-text-secondary)]">A WhatsApp draft is open. Review it and press Send; no message was sent automatically.</p>}
          {whatsappFallbackUrl && (
            <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="text-[var(--color-text-secondary)]">The order was updated. WhatsApp did not open automatically; use this prepared customer update.</p>
              <WhatsAppAction preparedUrl={whatsappFallbackUrl} onClick={() => router.refresh()}>Open prepared status update</WhatsAppAction>
            </div>
          )}
          {feedback?.ok && !feedback.whatsappUrl && <p role="status" className="text-[var(--color-text-secondary)]">The order was updated, but WhatsApp could not be prepared because {feedback.whatsappUnavailableReason === "missing_phone" ? "the customer phone number is missing" : feedback.whatsappUnavailableReason === "invalid_phone" ? "the stored phone number is not a valid international or Egyptian number" : "the order status message template is unavailable"}.</p>}
          <p className="text-[10px] text-[var(--color-text-secondary)]">Customer notifications are queued after the status change; delivery is not guaranteed.</p>
        </form>
      ) : <p className="border-t border-[var(--color-border)] pt-3 text-[var(--color-text-secondary)]">{missingShipmentData ? "This shipped order is missing its required tracking number. Reconcile the shipment details before advancing its status." : "No further status transitions are available."}</p>}

      <div className="border-t border-[var(--color-border)] pt-4">
        <p className="font-semibold">Payment collection</p>
        <p className="mt-1 text-[var(--color-text-secondary)]">Order fulfillment and COD payment are recorded separately.</p>
        {canCollectCodPayment(order) ? (
          <form className="mt-3 space-y-2" onSubmit={handlePaymentSubmit}>
            <input type="hidden" name="orderId" value={order.id} />
            <Button type="submit" disabled={isPaymentPending}>{isPaymentPending ? "Recording collection..." : "Mark COD payment collected"}</Button>
            {paymentFeedback && <p role={paymentFeedback.ok ? "status" : "alert"} className={paymentFeedback.ok ? "text-[var(--color-primary)]" : "text-red-700"}>{paymentFeedback.message}</p>}
          </form>
        ) : <p className="mt-2 text-[var(--color-text-secondary)]">{order.payment_status === "paid" ? "Payment collected." : `Payment status: ${order.payment_status}. COD collection can be recorded after delivery.`}</p>}
      </div>
    </section>
  );
}
