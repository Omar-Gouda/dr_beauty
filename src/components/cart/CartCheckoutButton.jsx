"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useCart } from "@/constants/CartContext";

const ATTEMPT_STORAGE_KEY = "dr_beauty_cod_order_attempt_v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function hasSavedAttempt() {
  try {
    const attempt = JSON.parse(window.sessionStorage.getItem(ATTEMPT_STORAGE_KEY) ?? "null");
    return UUID_PATTERN.test(attempt?.idempotencyKey ?? "");
  } catch {
    return false;
  }
}

function subscribeToAttempt(callback) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("dr-beauty-checkout-attempt-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("dr-beauty-checkout-attempt-change", callback);
  };
}

function getAttemptSnapshot() {
  return hasSavedAttempt() ? "saved" : "none";
}

export default function CartCheckoutButton({ href = "/checkout", className = "", shippingAvailable = true }) {
  const router = useRouter();
  const { cartAvailable, availabilityReady, setIsCartOpen, verifyCartAvailability } = useCart();
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const savedAttempt = useSyncExternalStore(subscribeToAttempt, getAttemptSnapshot, () => "none") === "saved";

  async function continueToCheckout() {
    if (checking || (!shippingAvailable && !savedAttempt) || (!cartAvailable && !savedAttempt)) return;
    if (!cartAvailable && savedAttempt) {
      setIsCartOpen(false);
      router.push(href);
      return;
    }
    setChecking(true);
    setMessage("");
    const result = await verifyCartAvailability();
    setChecking(false);
    if (result.ok) {
      setIsCartOpen(false);
      router.push(href);
      return;
    }
    setMessage(result.reason === "unavailable"
      ? "One or more items are out of stock. Remove them from your bag before checkout."
      : "Availability could not be confirmed. Please retry in a moment.");
  }

  async function retryAvailability() {
    if (checking) return;
    setChecking(true);
    setMessage("");
    const result = await verifyCartAvailability();
    setChecking(false);
    if (result.reason === "unavailable") {
      setMessage("One or more items are out of stock. Remove them from your bag before checkout.");
    } else if (!result.ok) {
      setMessage("Availability could not be confirmed. Please try again later.");
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={continueToCheckout}
        disabled={!availabilityReady || (!shippingAvailable && !savedAttempt) || (!cartAvailable && !savedAttempt) || checking}
        className={`w-full flex items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] py-4 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-[var(--color-primary)]/20 transition-all hover:bg-[var(--color-primary-hover)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        {checking ? "Checking availability…" : !availabilityReady ? "Checking your items…" : savedAttempt && !cartAvailable ? "Resume secure checkout attempt" : "Proceed to Checkout"}
        {!checking && availabilityReady && (cartAvailable || savedAttempt) && <ArrowRight aria-hidden="true" className="h-4 w-4" />}
      </button>
      {!shippingAvailable && !savedAttempt && (
        <p role="status" className="text-xs text-[var(--color-text-secondary)]">Shipping is not available until its current configuration can be confirmed.</p>
      )}
      {availabilityReady && !cartAvailable && !savedAttempt && (
        <p role="status" className="text-xs text-[var(--color-text-secondary)]">
          {message || "Your bag must contain only verified available products before checkout."}
        </p>
      )}
      {availabilityReady && !cartAvailable && !savedAttempt && (
        <button type="button" onClick={retryAvailability} disabled={checking} className="text-xs font-semibold text-[var(--color-primary)] underline disabled:opacity-60">
          Check availability again
        </button>
      )}
    </div>
  );
}
