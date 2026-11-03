"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import Container from "@/components/ui/Container";
import CustomSelect from "@/components/ui/Select";
import CartSummary from "@/components/cart/CartSummary";
import WhatsAppAction from "@/components/whatsapp/WhatsAppAction";
import { buildCodOrderConfirmationUrl, getWhatsAppSupportDestination, normalizeWhatsAppPhoneNumber } from "@/lib/whatsapp/messages.mjs";
import { useCart } from "@/constants/CartContext";
import { createCodOrderAttempt, previewPromotionCode } from "./actions";
import { getPromotionCodeSubmissionState } from "@/lib/promotions.mjs";

const ATTEMPT_STORAGE_KEY = "dr_beauty_cod_order_attempt_v1";
const ATTEMPT_CHANGE_EVENT = "dr-beauty-checkout-attempt-change";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getAttemptSnapshot() {
  try {
    return window.sessionStorage.getItem(ATTEMPT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribeToAttempt(callback) {
  window.addEventListener("storage", callback);
  window.addEventListener(ATTEMPT_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(ATTEMPT_CHANGE_EVENT, callback);
  };
}

function publishAttemptChange() {
  window.dispatchEvent(new Event(ATTEMPT_CHANGE_EVENT));
}

function parseStoredAttempt(snapshot) {
  if (!snapshot) return { status: "none", attempt: null };
  try {
    const saved = JSON.parse(snapshot);
    if (!saved || !UUID_PATTERN.test(saved.idempotencyKey ?? "")) {
      return { status: "unrecoverable", attempt: null };
    }

    const validItems = Array.isArray(saved.items) && saved.items.length > 0 && saved.items.length <= 50 &&
      saved.items.every((item) => UUID_PATTERN.test(item?.id ?? "") && Number.isInteger(item?.quantity) && item.quantity > 0 && item.quantity <= 999 && typeof item?.revision === "string");
    const request = saved.request;
    const validRequest = request &&
      typeof request.customerName === "string" && request.customerName.trim().length > 0 && request.customerName.length <= 160 &&
      typeof request.customerPhone === "string" && request.customerPhone.trim().length > 0 && request.customerPhone.length <= 40 &&
      typeof request.governorate === "string" && request.governorate.trim().length > 0 && request.governorate.length <= 120 &&
      typeof request.city === "string" && request.city.trim().length > 0 && request.city.length <= 120 &&
      typeof request.addressLine === "string" && request.addressLine.trim().length > 0 && request.addressLine.length <= 1000 &&
      typeof request.deliveryNotes === "string" && request.deliveryNotes.length <= 1000 &&
      (request.promotionCode === undefined || request.promotionCode === null ||
        (typeof request.promotionCode === "string" && request.promotionCode.length <= 64)) &&
      (request.additionalPhone === undefined || request.additionalPhone === null || (typeof request.additionalPhone === "string" && request.additionalPhone.length <= 40)) &&
      (request.addressId === undefined || request.addressId === null || UUID_PATTERN.test(request.addressId)) &&
      (request.isGift === undefined || typeof request.isGift === "boolean") &&
      (request.giftRecipientName === undefined || request.giftRecipientName === null || (typeof request.giftRecipientName === "string" && request.giftRecipientName.length <= 160)) &&
      (request.giftRecipientPhone === undefined || request.giftRecipientPhone === null || (typeof request.giftRecipientPhone === "string" && request.giftRecipientPhone.length <= 40)) &&
      (request.giftMessage === undefined || request.giftMessage === null || (typeof request.giftMessage === "string" && request.giftMessage.length <= 500)) &&
      (request.giftPackagingSelected === undefined || typeof request.giftPackagingSelected === "boolean") &&
      (request.saveNewAddress === undefined || typeof request.saveNewAddress === "boolean");
    const validConsentChoice = typeof saved.whatsappConsent === "boolean";

    const normalizedRequest = validRequest ? {
      ...request,
      additionalPhone: request.additionalPhone ?? "",
      addressId: request.addressId ?? null,
      isGift: request.isGift ?? false,
      giftRecipientName: request.giftRecipientName ?? "",
      giftRecipientPhone: request.giftRecipientPhone ?? "",
      giftMessage: request.giftMessage ?? "",
      giftPackagingSelected: request.giftPackagingSelected ?? false,
      saveNewAddress: request.saveNewAddress ?? false,
    } : null;

    return validItems && validRequest && validConsentChoice
      ? { status: "valid", attempt: { ...saved, request: normalizedRequest } }
      : { status: "unrecoverable", attempt: null };
  } catch {
    return { status: "unrecoverable", attempt: null };
  }
}

function readOrCreateAttempt(cartItems, request, whatsappConsent, attemptRef) {
  if (attemptRef.current) return attemptRef.current;
  let stored;
  try {
    stored = window.sessionStorage.getItem(ATTEMPT_STORAGE_KEY);
  } catch {
    return { persistenceUnavailable: true };
  }
  if (stored) {
    const parsed = parseStoredAttempt(stored);
    if (parsed.status === "valid") {
      attemptRef.current = parsed.attempt;
      return parsed.attempt;
    }
    return { unrecoverable: true };
  }

  const items = cartItems.map(({ id, quantity, revision }) => ({ id, quantity, revision }));
  if (items.length === 0) return null;
  const attempt = { idempotencyKey: window.crypto.randomUUID(), items, request, whatsappConsent };
  try {
    window.sessionStorage.setItem(ATTEMPT_STORAGE_KEY, JSON.stringify(attempt));
    publishAttemptChange();
  } catch {
    return { persistenceUnavailable: true };
  }
  attemptRef.current = attempt;
  return attempt;
}

export default function CheckoutForm({ configurationUnavailable = false, initialProfile = null, savedAddresses = [], savedAddressesUnavailable = false, giftPackagingFee = null }) {
  const router = useRouter();
  const { cartItems, subtotal, availabilityReady, cartAvailable, verifyCartAvailability, clearItemsIfUnchanged } = useCart();
  const storedAttempt = parseStoredAttempt(useSyncExternalStore(
    subscribeToAttempt,
    getAttemptSnapshot,
    () => null
  ));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shippingAvailable, setShippingAvailable] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [confirmation, setConfirmation] = useState(null);
  const [promotionCode, setPromotionCode] = useState("");
  const [promotionQuote, setPromotionQuote] = useState(null);
  const [promotionMessage, setPromotionMessage] = useState("");
  const [isPreviewingPromotion, setIsPreviewingPromotion] = useState(false);
  const [inMemoryAttemptLocked, setInMemoryAttemptLocked] = useState(false);
  const attemptLocked = storedAttempt.status !== "none" || inMemoryAttemptLocked;
  const unrecoverableAttempt = storedAttempt.status === "unrecoverable";
  const submittingRef = useRef(false);
  const attemptRef = useRef(null);
  const resumingAttempt = storedAttempt.status === "valid" || inMemoryAttemptLocked;
  const defaultAddress = savedAddresses.find((address) => address.is_default) ?? savedAddresses[0] ?? null;
  const [selectedAddressId, setSelectedAddressId] = useState(defaultAddress?.id ?? "new");
  const [formData, setFormData] = useState(() => ({
    fullName: initialProfile?.full_name ?? "",
    phone: initialProfile?.phone ?? "",
    additionalPhone: "",
    governorate: defaultAddress?.governorate ?? "",
    city: defaultAddress?.city ?? "",
    address: defaultAddress?.address_line ?? "",
    notes: defaultAddress?.delivery_notes ?? "",
    saveNewAddress: false,
    giftRecipientName: "",
    giftRecipientPhone: "",
    giftMessage: "",
  }));
  const [whatsappConsent, setWhatsAppConsent] = useState(false);
  const [isGift, setIsGift] = useState(false);
  const [giftPackagingSelected, setGiftPackagingSelected] = useState(false);
  const savedRequest = storedAttempt.attempt?.request;
  const cartPricingSignature = cartItems.map((item) => `${item.id}:${item.quantity}`).sort().join("|");
  const visiblePromotionCode = savedRequest?.promotionCode ?? promotionCode;
  const promotionSubmissionState = getPromotionCodeSubmissionState(visiblePromotionCode, promotionQuote, cartPricingSignature);
  const promotionApplied = promotionSubmissionState === "applied";
  const promotionQuoteStale = Boolean(promotionQuote && promotionQuote.signature !== cartPricingSignature);
  const visibleWhatsAppConsent = typeof storedAttempt.attempt?.whatsappConsent === "boolean"
    ? storedAttempt.attempt.whatsappConsent
    : whatsappConsent;
  const visibleFormData = savedRequest
    ? {
      fullName: savedRequest.customerName,
      phone: savedRequest.customerPhone,
      governorate: savedRequest.governorate,
      city: savedRequest.city,
      address: savedRequest.addressLine,
      notes: savedRequest.deliveryNotes,
      additionalPhone: savedRequest.additionalPhone ?? "",
      saveNewAddress: savedRequest.saveNewAddress ?? false,
      giftRecipientName: savedRequest.giftRecipientName ?? "",
      giftRecipientPhone: savedRequest.giftRecipientPhone ?? "",
      giftMessage: savedRequest.giftMessage ?? "",
    }
    : formData;
  const visibleAddressId = savedRequest ? savedRequest.addressId ?? "new" : selectedAddressId;
  const addressOptions = savedAddresses.map((address) => {
    const fullLabel = `${address.recipient_name} · ${address.city}, ${address.governorate}${address.is_default ? " · Default" : ""}`;
    return {
      value: address.id,
      label: fullLabel.length > 56 ? `${fullLabel.slice(0, 53)}…` : fullLabel,
    };
  });
  if (visibleAddressId !== "new" && !addressOptions.some((option) => option.value === visibleAddressId)) {
    addressOptions.push({ value: visibleAddressId, label: "Saved address unavailable" });
  }
  addressOptions.push({ value: "new", label: "Add a new address" });
  const visibleIsGift = typeof savedRequest?.isGift === "boolean" ? savedRequest.isGift : isGift;
  const visibleGiftPackagingSelected = typeof savedRequest?.giftPackagingSelected === "boolean"
    ? savedRequest.giftPackagingSelected
    : giftPackagingSelected;
  const visibleError = errorMessage || (unrecoverableAttempt
    ? "A previous checkout attempt cannot be safely resumed because its original details are unavailable. Check for an existing order before placing another."
    : "");

  const handleChange = (event) => {
    setFormData((previous) => ({ ...previous, [event.target.name]: event.target.value }));
  };

  function selectAddress(addressId) {
    if (attemptLocked || isSubmitting) return;
    setSelectedAddressId(addressId);
    const address = savedAddresses.find((item) => item.id === addressId);
    setFormData((previous) => ({
      ...previous,
      governorate: address?.governorate ?? "",
      city: address?.city ?? "",
      address: address?.address_line ?? "",
      notes: address?.delivery_notes ?? "",
      saveNewAddress: false,
      ...(isGift ? {
        giftRecipientName: address?.recipient_name ?? previous.giftRecipientName,
        giftRecipientPhone: address?.phone ?? previous.giftRecipientPhone,
      } : {}),
    }));
  }

  function toggleGift(enabled) {
    if (attemptLocked || isSubmitting) return;
    setIsGift(enabled);
    if (!enabled) {
      setGiftPackagingSelected(false);
      return;
    }
    const address = savedAddresses.find((item) => item.id === selectedAddressId);
    if (address) {
      setFormData((previous) => ({
        ...previous,
        giftRecipientName: previous.giftRecipientName || address.recipient_name || "",
        giftRecipientPhone: previous.giftRecipientPhone || address.phone || "",
      }));
    }
  }

  async function applyPromotion() {
    if (isPreviewingPromotion || isSubmitting || attemptLocked) return;
    setPromotionMessage("");
    setPromotionQuote(null);
    setIsPreviewingPromotion(true);
    try {
      const result = await previewPromotionCode(visiblePromotionCode, cartItems.map(({ id, quantity }) => ({ id, quantity })));
      if (!result.ok) {
        setPromotionMessage(result.message);
        return;
      }
      setPromotionCode(result.quote.code);
      setPromotionQuote({ ...result.quote, signature: cartPricingSignature });
      setPromotionMessage("Discount estimate applied. Final eligibility and order totals are checked again when you place the order.");
    } catch {
      setPromotionMessage("Discount codes are temporarily unavailable.");
    } finally {
      setIsPreviewingPromotion(false);
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;
    if (configurationUnavailable) {
      setErrorMessage("Checkout is temporarily unavailable. Please try again later.");
      return;
    }
    if (unrecoverableAttempt) return;
    if (cartItems.length === 0) {
      setErrorMessage("Your cart is empty. Add an item before placing an order.");
      return;
    }
    if (!resumingAttempt && (!availabilityReady || !cartAvailable)) {
      setErrorMessage("One or more items are unavailable or could not be verified. Return to your bag to review the items before checkout.");
      return;
    }
    if (!resumingAttempt && !shippingAvailable) {
      setErrorMessage("Shipping is unavailable until the current shipping configuration can be confirmed.");
      return;
    }
    if (!resumingAttempt && promotionSubmissionState !== "none" && !promotionApplied) {
      setPromotionMessage(promotionSubmissionState === "stale"
        ? "Your bag changed. Reapply the code before placing the order."
        : "Apply and verify this discount code before placing the order, or clear the code field.");
      return;
    }
    if (visibleFormData.additionalPhone.trim() && !normalizeWhatsAppPhoneNumber(visibleFormData.additionalPhone)) {
      setErrorMessage("Enter the additional phone number in a valid Egyptian or international format.");
      return;
    }
    if (visibleIsGift && !normalizeWhatsAppPhoneNumber(visibleFormData.giftRecipientPhone)) {
      setErrorMessage("Enter the gift recipient's phone number in a valid Egyptian or international format.");
      return;
    }
    const request = {
      customerName: visibleFormData.fullName.trim(),
      customerPhone: visibleFormData.phone.trim(),
      additionalPhone: visibleFormData.additionalPhone.trim(),
      addressId: visibleAddressId === "new" ? null : visibleAddressId,
      governorate: visibleFormData.governorate.trim(),
      city: visibleFormData.city.trim(),
      addressLine: visibleFormData.address.trim(),
      deliveryNotes: visibleFormData.notes.trim(),
      promotionCode: promotionApplied ? promotionQuote.code : null,
      isGift: visibleIsGift,
      giftRecipientName: visibleIsGift ? visibleFormData.giftRecipientName.trim() : "",
      giftRecipientPhone: visibleIsGift ? visibleFormData.giftRecipientPhone.trim() : "",
      giftMessage: visibleIsGift ? visibleFormData.giftMessage.trim() : "",
      giftPackagingSelected: visibleIsGift && visibleGiftPackagingSelected,
      saveNewAddress: visibleAddressId === "new" && visibleFormData.saveNewAddress,
    };
    submittingRef.current = true;
    setIsSubmitting(true);
    setErrorMessage("");
    if (!resumingAttempt) {
      let availability;
      try {
        availability = await verifyCartAvailability();
      } catch {
        availability = { ok: false, reason: "check_failed" };
      }
      if (!availability.ok) {
        setErrorMessage(availability.reason === "unavailable"
          ? "One or more items are out of stock. Return to your bag and remove them before placing a new order."
          : "Availability could not be confirmed. Return to your bag and retry the availability check.");
        submittingRef.current = false;
        setIsSubmitting(false);
        return;
      }
    }
    const attempt = readOrCreateAttempt(cartItems, request, visibleWhatsAppConsent, attemptRef);
    if (attempt?.persistenceUnavailable) {
      setErrorMessage("Checkout cannot start because this browser could not save a secure retry record. Enable session storage and try again.");
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }
    if (attempt?.unrecoverable) {
      setErrorMessage("A previous checkout attempt cannot be safely resumed because its original details are unavailable. Check for an existing order before placing another.");
      setInMemoryAttemptLocked(true);
      publishAttemptChange();
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }
    if (!attempt) {
      setErrorMessage("Your cart is empty. Add an item before placing an order.");
      submittingRef.current = false;
      setIsSubmitting(false);
      return;
    }
    setInMemoryAttemptLocked(true);

    try {
      const result = await createCodOrderAttempt({
        items: attempt.items,
        idempotencyKey: attempt.idempotencyKey,
        whatsappConsent: attempt.whatsappConsent,
        ...attempt.request,
      });

      if (result?.ok) {
        let whatsappUrl = null;
        let whatsappStatus = attempt.whatsappConsent ? "unavailable" : "consent_not_given";
        if (attempt.whatsappConsent) {
          const whatsappDestination = getWhatsAppSupportDestination();
          if (!whatsappDestination) {
            whatsappStatus = "not_configured";
          } else {
            try {
              whatsappUrl = buildCodOrderConfirmationUrl(whatsappDestination, result.confirmation);
              whatsappStatus = "ready";
            } catch {
              whatsappStatus = "details_unavailable";
            }
          }
        }
        const cartCleared = clearItemsIfUnchanged(attempt.items);
        if (cartCleared) {
          attemptRef.current = null;
          setInMemoryAttemptLocked(false);
          try {
            window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
            publishAttemptChange();
          } catch {
            // A retained key remains safe: the RPC returns the same order on retry.
          }
        }
        setConfirmation({ ...result.confirmation, whatsappUrl, whatsappStatus });
        return;
      }

      if (result?.code === "unauthenticated") {
        router.push("/login?next=%2Fcheckout");
        return;
      }
      if (result?.retrySameAttempt === false) {
        attemptRef.current = null;
        setInMemoryAttemptLocked(false);
        try {
          window.sessionStorage.removeItem(ATTEMPT_STORAGE_KEY);
          publishAttemptChange();
        } catch {
          // A later retry will still be idempotent if storage remains available.
        }
      }
      setErrorMessage(result?.message ?? "We could not place the order. Please try again.");
    } catch {
      setErrorMessage("We could not confirm whether the order was saved. Retry this same checkout to safely check its status.");
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (confirmation) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-[var(--color-success)]" />
          <h1 className="mb-2 font-editorial text-2xl font-bold text-[var(--color-text)]">
            Order received
          </h1>
          <p className="mb-6 text-xs leading-relaxed text-[var(--color-text-secondary)] sm:text-sm">
            Reference #{confirmation.orderNumber}. Status: {confirmation.status.replaceAll("_", " ")}. COD total: {confirmation.currency} {confirmation.totalAmount}.
          </p>
          <div className="mb-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-left text-xs text-[var(--color-text-secondary)]">
            <p className="font-semibold text-[var(--color-text)]">{confirmation.isGift ? "Gift order" : "Regular order"}</p>
            {confirmation.isGift && <>
              <p className="mt-2">Recipient: {confirmation.giftRecipientName}</p>
              {confirmation.giftMessage && <p className="mt-1">Gift message: {confirmation.giftMessage}</p>}
              <p className="mt-1">Gift packaging: {confirmation.giftPackagingSelected
                ? `Included · ${confirmation.currency} ${Number(confirmation.giftPackagingFeeAmount).toFixed(2)}`
                : "Not requested"}</p>
            </>}
          </div>
          <p className="mb-5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            The order is saved. Its confirmation email is queued for processing; this page cannot confirm provider delivery.
          </p>
          {confirmation.whatsappStatus === "ready" && confirmation.whatsappUrl ? (
            <>
              <p className="mb-3 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                Your order is saved. Open the prepared WhatsApp draft, review it, and press Send. Reopening it will not create another order.
              </p>
              <WhatsAppAction className="mb-3 w-full" preparedUrl={confirmation.whatsappUrl}>
                Open prepared WhatsApp message
              </WhatsAppAction>
            </>
          ) : confirmation.whatsappStatus === "consent_not_given" ? (
            <p role="status" className="mb-3 text-xs text-[var(--color-text-secondary)]">Your order is saved. No WhatsApp draft was prepared because optional order-message consent was not selected.</p>
          ) : confirmation.whatsappStatus === "not_configured" ? (
            <p role="status" className="mb-3 text-xs text-[var(--color-text-secondary)]">Your order is saved. WhatsApp support is not configured on this deployment.</p>
          ) : confirmation.whatsappStatus === "details_unavailable" ? (
            <p role="status" className="mb-3 text-xs text-[var(--color-text-secondary)]">Your order is saved, but its saved item details could not be prepared for WhatsApp. You can review the order details below.</p>
          ) : (
            <p role="status" className="mb-3 text-xs text-[var(--color-text-secondary)]">Your order is saved. A WhatsApp draft is unavailable right now; review the order details below.</p>
          )}
          <Link
            href={`/orders/${encodeURIComponent(confirmation.orderNumber)}`}
            className="mb-3 inline-flex w-full items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)] py-3 text-xs font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            View Order Details
          </Link>
          <Link
            href="/shop"
            className="inline-flex w-full items-center justify-center rounded-full bg-[var(--color-primary)] py-3 text-xs font-semibold text-white shadow-md transition-all hover:bg-[var(--color-primary-hover)]"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-[var(--color-background)] py-12 sm:py-16">
      <Container className="max-w-[1400px]">
        <div className="mb-8">
          <Link href="/cart" className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)]">
            <ArrowLeft className="h-4 w-4" /> Back to Cart
          </Link>
        </div>

        <h1 className="mb-8 font-editorial text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
          Checkout &amp; Delivery
        </h1>

        <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:min-w-[960px] lg:grid-cols-12 lg:gap-12">
          <div className="min-w-0 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-6 lg:col-span-7 lg:p-8">
            <h2 className="mb-6 font-editorial text-xl font-bold text-[var(--color-text)]">
              Shipping Information (Egypt)
            </h2>

            {configurationUnavailable && (
              <p role="alert" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                Checkout is temporarily unavailable. Please try again later.
              </p>
            )}
            {!shippingAvailable && !resumingAttempt && cartItems.length > 0 && (
              <p role="status" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">Checking whether delivery is currently available. New orders remain disabled until shipping can be verified.</p>
            )}
            {visibleError && (
              <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
                {visibleError}
              </p>
            )}
            {attemptLocked && !unrecoverableAttempt && !confirmation && (
              <p role="status" className="mb-4 rounded-2xl bg-[var(--color-background)] p-4 text-xs text-[var(--color-text-secondary)]">
                This checkout is being retried with its original delivery details and item selection.
              </p>
            )}

            {cartItems.length === 0 && (
              <p role="status" className="mb-4 rounded-2xl bg-[var(--color-background)] p-4 text-xs text-[var(--color-text-secondary)]">
                Your cart is empty. <Link href="/shop" className="font-semibold text-[var(--color-primary)] hover:underline">Browse the shop</Link> to add products.
              </p>
            )}
            {cartItems.length > 0 && !availabilityReady && (
              <p role="status" className="mb-4 rounded-2xl bg-[var(--color-background)] p-4 text-xs text-[var(--color-text-secondary)]">
                Checking the current availability of your bag…
              </p>
            )}
            {cartItems.length > 0 && availabilityReady && !cartAvailable && (
              <p role="alert" className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                One or more items are unavailable or could not be verified. Return to your bag to remove unavailable items or retry the check.
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" aria-busy={isSubmitting}>
              <div>
                <label htmlFor="fullName" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Full Name *</label>
                <input id="fullName" type="text" name="fullName" required maxLength={160} readOnly={attemptLocked} value={visibleFormData.fullName} onChange={handleChange} autoComplete="name" placeholder="e.g. Salma Mohamed" className="min-h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="phone" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Your primary contact number *</label>
                  <input id="phone" type="tel" name="phone" required maxLength={40} readOnly={attemptLocked} value={visibleFormData.phone} onChange={handleChange} autoComplete="tel" placeholder="e.g. 01012345678" className="min-h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
                </div>
                <div>
                  <label htmlFor="additionalPhone" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Additional phone number (optional)</label>
                  <input id="additionalPhone" type="tel" name="additionalPhone" maxLength={40} readOnly={attemptLocked} value={visibleFormData.additionalPhone} onChange={handleChange} autoComplete="tel-national" placeholder="Egyptian or international number" className="min-h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
                  <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">Your profile number remains primary; this one is saved only with the order.</p>
                </div>
              </div>

              <label htmlFor="whatsappConsent" className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-xs text-[var(--color-text-secondary)]">
                <input
                  id="whatsappConsent"
                  name="whatsappConsent"
                  type="checkbox"
                  checked={visibleWhatsAppConsent}
                  disabled={attemptLocked || isSubmitting}
                  onChange={(event) => setWhatsAppConsent(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                />
                <span>
                  I agree to receive optional transactional WhatsApp messages about this order, including confirmation and delivery updates. This consent does not cover marketing messages.
                </span>
              </label>

              <fieldset className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                <legend className="px-1 text-xs font-semibold text-[var(--color-text)]">Delivery address</legend>
                <label htmlFor="savedAddress" className="block text-xs font-semibold text-[var(--color-text)]">Choose a saved address or add a new one</label>
                <CustomSelect
                  id="savedAddress"
                  ariaLabel="Delivery address"
                  value={visibleAddressId}
                  options={addressOptions}
                  onChange={selectAddress}
                  disabled={attemptLocked || isSubmitting}
                  className="min-w-0"
                />
                {visibleAddressId !== "new" && (() => {
                  const address = savedAddresses.find((item) => item.id === visibleAddressId);
                  return address ? <div className="min-w-0 rounded-xl bg-[var(--color-surface)] p-3 text-xs leading-5 text-[var(--color-text-secondary)] [overflow-wrap:anywhere]">
                    <p className="font-semibold text-[var(--color-text)]">{address.recipient_name} · {address.phone}</p>
                    <p>{address.address_line}</p>
                    <p>{address.city}, {address.governorate}</p>
                    {address.delivery_notes && <p>Delivery note: {address.delivery_notes}</p>}
                  </div> : <p role="alert" className="text-xs text-amber-800">This saved address is unavailable. Choose another address or add a new one.</p>;
                })()}
              </fieldset>

              <div>
                <label htmlFor="governorate" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Governorate *</label>
                <input id="governorate" type="text" name="governorate" required maxLength={120} readOnly={attemptLocked || visibleAddressId !== "new"} value={visibleFormData.governorate} onChange={handleChange} autoComplete="address-level1" placeholder="e.g. Cairo" className="min-h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
              </div>

              <div>
                <label htmlFor="city" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">City *</label>
                <input id="city" type="text" name="city" required maxLength={120} readOnly={attemptLocked || visibleAddressId !== "new"} value={visibleFormData.city} onChange={handleChange} autoComplete="address-level2" placeholder="e.g. Nasr City" className="min-h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
              </div>

              <div>
                <label htmlFor="address" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Detailed Address *</label>
                <textarea id="address" name="address" required maxLength={1000} rows="3" readOnly={attemptLocked || visibleAddressId !== "new"} value={visibleFormData.address} onChange={handleChange} autoComplete="street-address" placeholder="Street name, building number, floor, apartment..." className="min-h-28 w-full resize-y rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
              </div>

              <div>
                <label htmlFor="notes" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Order Notes (Optional)</label>
                <input id="notes" type="text" name="notes" maxLength={1000} readOnly={attemptLocked || visibleAddressId !== "new"} value={visibleFormData.notes} onChange={handleChange} placeholder="Special instructions for delivery..." className="min-h-12 w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]" />
              </div>

              {visibleAddressId === "new" && <label className="flex min-h-11 items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-xs text-[var(--color-text-secondary)]">
                <input type="checkbox" checked={visibleFormData.saveNewAddress} disabled={attemptLocked || isSubmitting} onChange={(event) => setFormData((previous) => ({ ...previous, saveNewAddress: event.target.checked }))} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
                <span>Save this new delivery address to my Address Book after the order is created.</span>
              </label>}

              <label className="flex min-h-12 items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm text-[var(--color-text)]">
                <input type="checkbox" checked={visibleIsGift} disabled={attemptLocked || isSubmitting} onChange={(event) => toggleGift(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" />
                <span><span className="block font-semibold">Is this order a gift?</span><span className="mt-1 block text-xs text-[var(--color-text-secondary)]">Recipient details stay separate from your profile and buyer contact information.</span></span>
              </label>

              {visibleIsGift && <section aria-labelledby="gift-details-heading" className="space-y-4 rounded-2xl border border-[var(--color-rose)]/30 bg-[var(--color-primary-light)] p-4 sm:p-5">
                <div><h3 id="gift-details-heading" className="font-editorial text-lg font-semibold text-[var(--color-text)]">Gift details</h3><p className="mt-1 text-xs text-[var(--color-text-secondary)]">The delivery address above is used for the recipient; your buyer information remains on the order.</p></div>
                <div><label htmlFor="giftRecipientName" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Recipient full name *</label><input id="giftRecipientName" name="giftRecipientName" required maxLength={160} readOnly={attemptLocked} value={visibleFormData.giftRecipientName} onChange={handleChange} autoComplete="off" className="min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20" /></div>
                <div><label htmlFor="giftRecipientPhone" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Recipient phone number *</label><input id="giftRecipientPhone" name="giftRecipientPhone" type="tel" required maxLength={40} readOnly={attemptLocked} value={visibleFormData.giftRecipientPhone} onChange={handleChange} autoComplete="off" placeholder="Egyptian or international number" className="min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20" /></div>
                <div><label htmlFor="giftMessage" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Gift message (optional)</label><textarea id="giftMessage" name="giftMessage" rows="3" maxLength={500} readOnly={attemptLocked} value={visibleFormData.giftMessage} onChange={handleChange} className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20" /></div>
                <label className="flex min-h-12 items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs text-[var(--color-text-secondary)]"><input type="checkbox" checked={visibleGiftPackagingSelected} disabled={attemptLocked || isSubmitting || giftPackagingFee == null} onChange={(event) => setGiftPackagingSelected(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)]" /><span><span className="block font-semibold text-[var(--color-text)]">Add gift packaging{giftPackagingFee != null ? ` · EGP ${Number(giftPackagingFee).toFixed(2)}` : ""}</span><span className="mt-1 block">{giftPackagingFee == null ? "Unavailable until the owner configures and confirms a fee." : "The configured fee is added to the order total and verified again when you place the order."}</span></span></label>
              </section>}

              <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                <label htmlFor="promotionCode" className="mb-2 block text-xs font-semibold text-[var(--color-text)]">Discount code</label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input id="promotionCode" name="promotionCode" maxLength={64} readOnly={attemptLocked} disabled={isSubmitting || isPreviewingPromotion} value={visiblePromotionCode} onChange={(event) => { setPromotionCode(event.target.value); setPromotionQuote(null); setPromotionMessage(""); }} autoComplete="off" className="min-h-11 min-w-0 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm uppercase text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20" />
                  <button type="button" onClick={applyPromotion} disabled={attemptLocked || isSubmitting || isPreviewingPromotion || !visiblePromotionCode.trim()} className="min-h-11 rounded-xl border border-[var(--color-border)] px-5 text-xs font-semibold text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-50">
                    {isPreviewingPromotion ? "Checking…" : promotionApplied ? "Check Again" : "Apply Code"}
                  </button>
                </div>
                {(promotionQuoteStale || promotionMessage) && <p role={promotionApplied ? "status" : "alert"} className="mt-2 text-xs text-[var(--color-text-secondary)]">{promotionQuoteStale ? "Your bag changed. Reapply the code to see an updated estimate." : promotionMessage}</p>}
              </div>

              <div className="border-t border-[var(--color-border)] pt-4">
                <span className="mb-2 block text-xs font-bold text-[var(--color-text)]">Payment Method</span>
                <div className="flex items-center justify-between rounded-2xl border border-[var(--color-primary)]/30 bg-[var(--color-background)] p-4 text-xs font-semibold text-[var(--color-text)]">
                  <span>💵 Cash on Delivery (COD)</span>
                  <span className="text-[var(--color-primary)]">Available</span>
                </div>
              </div>

              <button type="submit" disabled={isSubmitting || configurationUnavailable || unrecoverableAttempt || cartItems.length === 0 || (!cartAvailable && !resumingAttempt) || (!shippingAvailable && !resumingAttempt)} className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-success)] px-4 py-4 text-sm font-semibold text-white shadow-lg shadow-[var(--color-success)]/25 transition-all hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60">
                {isSubmitting ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Placing order...</> : <><CheckCircle2 className="h-4 w-4" /> {getWhatsAppSupportDestination() && visibleWhatsAppConsent ? "Place COD Order & Continue on WhatsApp" : "Place COD Order"}</>}
              </button>
            </form>
          </div>

          <div className="min-w-0 lg:col-span-5">
            <CartSummary subtotal={subtotal} promotionQuote={promotionApplied ? promotionQuote : null} showCheckoutButton={false} onShippingAvailabilityChange={setShippingAvailable} giftPackagingSelected={visibleIsGift && visibleGiftPackagingSelected} giftPackagingFee={giftPackagingFee} />
            <p className="mt-3 flex items-start gap-2 px-2 text-[11px] leading-relaxed text-[var(--color-text-secondary)]">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-primary)]" />
              Cart totals are estimates. Current prices and stock are checked securely when the order is placed.
            </p>
          </div>
        </div>
      </Container>
    </div>
  );
}
