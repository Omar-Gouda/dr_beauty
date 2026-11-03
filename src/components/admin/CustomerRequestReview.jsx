"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import Button from "@/components/ui/Button";
import CustomSelect from "@/components/ui/Select";
import { useToast } from "@/constants/ToastContext";
import { updateCustomerServiceRequest } from "@/app/admin/actions";
import WhatsAppAction from "@/components/whatsapp/WhatsAppAction";

const STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "in_review", label: "In review" },
  { value: "awaiting_customer", label: "Awaiting customer" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString("en-EG", { dateStyle: "medium", timeStyle: "short" });
}

export default function CustomerRequestReview({ request }) {
  const [status, setStatus] = useState(request.status);
  const [adminNotes, setAdminNotes] = useState(request.admin_notes ?? "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { showToast } = useToast();
  const requestLabel = request.request_type === "beauty_tips" ? "Beauty Tips" : "Support";
  const contactLabel = request.preferred_contact_method === "whatsapp" ? "WhatsApp" : request.preferred_contact_method === "phone" ? "Phone" : "Email";

  function saveRequest(event) {
    event.preventDefault();
    if (pending) return;
    startTransition(async () => {
      try {
        const result = await updateCustomerServiceRequest({ requestId: request.id, status, adminNotes });
        showToast(result.message, result.ok ? "success" : "error");
        if (result.ok) router.refresh();
      } catch {
        showToast("The request could not be updated. Please try again.", "error");
      }
    });
  }

  return (
    <article id={`request-${request.id}`} className="scroll-mt-8 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-primary)]">{requestLabel} · {request.category.replaceAll("_", " ")}</p>
          <h2 className="mt-1 font-editorial text-xl font-bold text-[var(--color-text)]">Customer request</h2>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Received {formatDate(request.created_at)}</p>
        </div>
        {request.order?.order_number && <p className="rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold">Order #{request.order.order_number} · {request.order.order_status.replaceAll("_", " ")}</p>}
      </div>

      {request.product?.name && <p className="mt-4 text-sm"><span className="font-semibold">Product:</span> {request.product.name}</p>}
      <section className="mt-4 rounded-2xl bg-[var(--color-background)] p-4">
        <h3 className="text-xs font-semibold text-[var(--color-text-secondary)]">Customer message</h3>
        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text)]">{request.question}</p>
      </section>

      <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
        <p><span className="font-semibold">Preferred contact:</span> {contactLabel}</p>
        <p className="break-all"><span className="font-semibold">Contact detail:</span> {request.contact_value}</p>
      </div>
      {request.preferred_contact_method === "whatsapp" && (
        <WhatsAppAction className="mt-3" destination={request.contact_value} templateId="admin.support_followup" unavailableMessage="The saved WhatsApp contact is not a valid Egyptian or international phone number." >Follow Up on WhatsApp</WhatsAppAction>
      )}

      <form onSubmit={saveRequest} className="mt-5 grid gap-4 border-t border-[var(--color-border)] pt-5 md:grid-cols-[minmax(12rem,0.7fr)_minmax(0,1.3fr)]">
        <div>
          <label htmlFor={`request-status-${request.id}`} className="mb-2 block text-xs font-semibold">Request status</label>
          <CustomSelect id={`request-status-${request.id}`} ariaLabel="Request status" value={status} onChange={setStatus} options={STATUS_OPTIONS} disabled={pending} />
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-secondary)]">Contact the customer manually using the selected channel. No message or call is sent by this screen.</p>
        </div>
        <div>
          <label htmlFor={`request-notes-${request.id}`} className="mb-2 block text-xs font-semibold">Internal notes</label>
          <textarea id={`request-notes-${request.id}`} rows={3} maxLength={4000} value={adminNotes} onChange={(event) => setAdminNotes(event.target.value)} disabled={pending} className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm outline-none focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:opacity-60" />
          <Button type="submit" size="sm" disabled={pending || adminNotes.length > 4000} className="mt-3"><Save aria-hidden="true" className="h-4 w-4" />{pending ? "Saving…" : "Save review"}</Button>
        </div>
      </form>
    </article>
  );
}
