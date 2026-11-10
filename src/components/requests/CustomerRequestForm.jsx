"use client";

import { useRef, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";
import Button from "@/components/ui/Button";
import CustomSelect from "@/components/ui/Select";
import { submitCustomerServiceRequest } from "@/app/(store)/actions";
import { BEAUTY_TIPS_CATEGORIES, CONTACT_METHODS, ORDER_SUPPORT_CATEGORIES, SUPPORT_CATEGORIES } from "@/constants/customerRequests";
import WhatsAppAction from "@/components/whatsapp/WhatsAppAction";
import { buildWhatsAppClickToChatUrl, getWhatsAppSupportDestination } from "@/lib/whatsapp/messages.mjs";

const INITIAL_STATE = { ok: false, message: "" };
const SUBMISSION_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function CustomerRequestForm({ requestType, email, phone, products, orders }) {
  const [state, setState] = useState(INITIAL_STATE);
  const [pending, setPending] = useState(false);
  const categories = requestType === "beauty_tips" ? BEAUTY_TIPS_CATEGORIES : SUPPORT_CATEGORIES;
  const [category, setCategory] = useState("");
  const [productId, setProductId] = useState("");
  const [orderId, setOrderId] = useState("");
  const [contactMethod, setContactMethod] = useState("email");
  const [contactValue, setContactValue] = useState(phone);
  const [question, setQuestion] = useState("");
  const [whatsappFallbackUrl, setWhatsappFallbackUrl] = useState(null);
  const [whatsappOpened, setWhatsappOpened] = useState(false);
  const [whatsappUnavailable, setWhatsappUnavailable] = useState(false);
  const submittingRef = useRef(false);
  const submissionKeyRef = useRef(null);
  const requiresOrder = requestType === "support" && ORDER_SUPPORT_CATEGORIES.has(category);
  const useWhatsAppDraft = contactMethod === "whatsapp";
  const actionTitle = useWhatsAppDraft
    ? `Save ${requestType === "beauty_tips" ? "request" : "support request"} & open WhatsApp draft`
    : requestType === "beauty_tips" ? "Send consultation request" : "Send support request";

  async function handleSubmit(event) {
    event.preventDefault();
    if (submittingRef.current || !event.currentTarget.reportValidity()) return;

    const formData = new FormData(event.currentTarget);
    const storageKey = `customer-service-submission:${requestType}`;
    let submissionKey = submissionKeyRef.current;
    if (!submissionKey) {
      try {
        const storedKey = window.sessionStorage.getItem(storageKey);
        submissionKey = SUBMISSION_KEY_PATTERN.test(storedKey ?? "") ? storedKey : null;
      } catch {
        submissionKey = null;
      }
      if (!submissionKey) submissionKey = window.crypto.randomUUID();
      submissionKeyRef.current = submissionKey;
      try { window.sessionStorage.setItem(storageKey, submissionKey); } catch { /* The ref still protects in-page retries. */ }
    }
    formData.set("submissionKey", submissionKey);
    setWhatsappFallbackUrl(null);
    setWhatsappOpened(false);
    setWhatsappUnavailable(false);
    let url = null;
    let popup = null;
    if (useWhatsAppDraft) {
      const selectedCategory = categories.find((item) => item.value === category)?.label ?? category;
      const selectedProduct = products?.find((product) => product.id === productId)?.name ?? "No specific product selected";
      const selectedOrder = orders?.find((order) => order.id === orderId);
      const supportCategory = selectedCategory || "General support";
      const destination = getWhatsAppSupportDestination();
      try {
        if (destination) {
          url = requestType === "beauty_tips"
            ? buildWhatsAppClickToChatUrl(destination, "consultation.beauty_tips", {
              category: selectedCategory,
              productName: selectedProduct,
              question: question.trim(),
            })
            : buildWhatsAppClickToChatUrl(destination,
              ["refund_request", "return_exchange"].includes(category) ? "support.return_request" : "support.request",
              ["refund_request", "return_exchange"].includes(category) ? {
                category: supportCategory,
                question: question.trim(),
                requestedAction: category === "refund_request" ? "Review refund eligibility and explain the next steps." : "Review the return or exchange request and explain the next steps.",
                orderReference: selectedOrder?.order_number ? String(selectedOrder.order_number) : "",
                productName: selectedProduct,
              } : {
                category: supportCategory,
                question: question.trim(),
                orderReference: selectedOrder?.order_number ? String(selectedOrder.order_number) : "",
                productName: selectedProduct === "No specific product selected" ? "" : selectedProduct,
              });
        }
      } catch {
        url = null;
      }
      if (url) {
        try {
          popup = window.open("about:blank", "_blank");
          if (popup) popup.opener = null;
        } catch {
          popup = null;
        }
      }
    }
    submittingRef.current = true;
    setPending(true);
    setState(INITIAL_STATE);
    try {
      const result = await submitCustomerServiceRequest(INITIAL_STATE, formData);
      setState(result);
      if (!result.ok) {
        if (result?.code === "request_conflict") {
          submissionKeyRef.current = null;
          try { window.sessionStorage.removeItem(storageKey); } catch { /* A fresh in-memory key is generated next time. */ }
        }
        try { popup?.close(); } catch { /* A failed submission must not affect saved data. */ }
        return;
      }

      submissionKeyRef.current = null;
      try { window.sessionStorage.removeItem(storageKey); } catch { /* The success screen prevents another submission in this view. */ }

      if (useWhatsAppDraft) {
        if (!url) {
          setWhatsappUnavailable(true);
        } else if (popup && !popup.closed) {
          try {
            popup.location.replace(url);
            setWhatsappOpened(true);
          } catch {
            try { popup.close(); } catch { /* The saved request remains intact. */ }
            setWhatsappFallbackUrl(url);
          }
        } else {
          setWhatsappFallbackUrl(url);
        }
      }
    } catch {
      try { popup?.close(); } catch { /* A failed submission must not affect saved data. */ }
      setState({ ok: false, message: "Your request could not be confirmed. Please try again." });
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  if (state.ok) {
    return (
      <div role="status" className="rounded-3xl border border-[var(--color-success)]/30 bg-[var(--color-surface)] p-7 shadow-sm sm:p-9">
        <CheckCircle2 aria-hidden="true" className="mb-4 h-9 w-9 text-[var(--color-success)]" />
        <h2 className="font-editorial text-2xl font-bold text-[var(--color-text)]">Request saved</h2>
        <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{state.message}</p>
        {whatsappOpened && <p className="mt-4 text-sm text-[var(--color-text-secondary)]">A WhatsApp draft is open with your selected category, product, and question. Review it and press Send; nothing was sent automatically.</p>}
        {whatsappFallbackUrl && <div className="mt-4"><WhatsAppAction preparedUrl={whatsappFallbackUrl}>Open prepared consultation draft</WhatsAppAction></div>}
        {whatsappUnavailable && <p className="mt-4 text-sm text-[var(--color-text-secondary)]">Your request is saved. The WhatsApp support destination is not configured, so no draft could be opened.</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-8">
      <input type="hidden" name="requestType" value={requestType} />
      <input type="hidden" name="category" value={category} />
      {requestType === "beauty_tips" && <input type="hidden" name="productId" value={productId} />}
      {requestType === "support" && <input type="hidden" name="orderId" value={orderId} />}
      <input type="hidden" name="contactMethod" value={contactMethod} />
      <input type="hidden" name="contactValue" value={contactMethod === "email" ? "" : contactValue} />

      {state.message && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{state.message}</p>}

      <div>
        <label htmlFor={`${requestType}-category`} className="mb-2 block text-sm font-semibold text-[var(--color-text)]">What can we help with? <span aria-hidden="true">*</span></label>
        <CustomSelect
          id={`${requestType}-category`}
          ariaLabel="Request category"
          value={category}
          onChange={setCategory}
          placeholder="Choose a category"
          options={categories}
          disabled={pending}
        />
      </div>

      {requestType === "beauty_tips" && (
        <div>
          <label htmlFor="request-product" className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Product (optional)</label>
          <CustomSelect
            id="request-product"
            ariaLabel="Related product"
            value={productId}
            onChange={setProductId}
            placeholder={products === null ? "Product list unavailable" : "No specific product"}
            options={[...(products === null ? [] : [{ value: "", label: "No specific product" }]), ...(products ?? []).map((product) => ({ value: product.id, label: product.name }))]}
            disabled={pending || products === null}
          />
          {products?.length === 0 && <p className="mt-2 text-xs text-[var(--color-text-secondary)]">No active products are available to select; you can still describe the product in your question.</p>}
        </div>
      )}

      {requestType === "support" && (
        <div>
          <label htmlFor="request-order" className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Related order{requiresOrder ? " *" : " (optional)"}</label>
          <CustomSelect
            id="request-order"
            ariaLabel="Related order"
            value={orderId}
            onChange={setOrderId}
            placeholder={orders === null ? "Your orders are unavailable" : "No order selected"}
            options={[...(orders === null ? [] : [{ value: "", label: "No order selected" }]), ...(orders ?? []).map((order) => ({ value: order.id, label: `Order #${order.order_number} · ${order.order_status.replaceAll("_", " ")}` }))]}
            disabled={pending || orders === null || !orders?.length}
          />
          {orders === null && <p className="mt-2 text-xs text-[var(--color-text-secondary)]">We could not load your order list. Refresh the page before submitting an order-specific request.</p>}
          {orders?.length === 0 && <p className="mt-2 text-xs text-[var(--color-text-secondary)]">No orders are available on this account yet.</p>}
        </div>
      )}

      <div>
        <label htmlFor="request-question" className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{requestType === "beauty_tips" ? "Your question or concern" : "How can we help?"} <span aria-hidden="true">*</span></label>
        <textarea
          id="request-question"
          name="question"
          rows={6}
          minLength={10}
          maxLength={useWhatsAppDraft ? 1200 : 4000}
          required
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          disabled={pending}
          placeholder={requestType === "beauty_tips" ? "Share your skin or hair type, what you are looking for, and any product question. Please avoid urgent or highly sensitive medical information." : "Describe the issue and include any details that can help us review it."}
          className="w-full resize-y rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:opacity-60"
        />
        <p className="mt-2 text-xs text-[var(--color-text-secondary)]">10–{useWhatsAppDraft ? "1,200" : "4,000"} characters. Do not include payment card details.</p>
        {useWhatsAppDraft && <p className="mt-2 text-xs text-[var(--color-text-secondary)]">After saving this request, the selected category, order number and product (when provided), and your description may appear in a WhatsApp draft. Review the complete message and choose whether to send it; no message is sent automatically. WhatsApp will receive the information only if you send the draft.</p>}
      </div>

      <div>
        <label htmlFor="request-contact-method" className="mb-2 block text-sm font-semibold text-[var(--color-text)]">Preferred reply method <span aria-hidden="true">*</span></label>
        <CustomSelect
          id="request-contact-method"
          ariaLabel="Preferred reply method"
          value={contactMethod}
          onChange={(value) => {
            setContactMethod(value);
            if (value === "email") setContactValue("");
            else if (!contactValue && phone) setContactValue(phone);
          }}
          options={CONTACT_METHODS}
          disabled={pending}
        />
        {contactMethod === "email" ? (
          <p className="mt-2 text-xs text-[var(--color-text-secondary)]">We will use the email address on your Dr. Beauty account{email ? ` (${email})` : ""}.</p>
        ) : (
          <div className="mt-4">
            <label htmlFor="request-contact-value" className="mb-2 block text-sm font-semibold text-[var(--color-text)]">{contactMethod === "whatsapp" ? "WhatsApp number" : "Phone number"} <span aria-hidden="true">*</span></label>
            <input
              id="request-contact-value"
              type="tel"
              autoComplete="tel"
              minLength={7}
              maxLength={40}
              required
              value={contactValue}
              onChange={(event) => setContactValue(event.target.value)}
              disabled={pending}
              placeholder="Include your country code if applicable"
              className="min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20 disabled:opacity-60"
            />
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">The team may contact you about this request through this channel. No message will be sent automatically, and this does not subscribe you to marketing.</p>
          </div>
        )}
      </div>

      <Button type="submit" size="lg" disabled={pending || !category || (requiresOrder && !orderId)} className="w-full sm:w-auto">
        <Send aria-hidden="true" className="h-4 w-4" />
        {pending ? "Submitting request…" : actionTitle}
      </Button>
    </form>
  );
}
