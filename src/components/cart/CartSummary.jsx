"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import CartCheckoutButton from "@/components/cart/CartCheckoutButton";
import { getShippingQuote } from "@/app/(checkout)/checkout/actions";

export default function CartSummary({ subtotal, promotionQuote = null, showCheckoutButton = true, checkoutHref = "/checkout", onShippingAvailabilityChange, giftPackagingSelected = false, giftPackagingFee = null }) {
  const [shippingState, setShippingState] = useState({ subtotal: null, status: "loading", quote: null });
  useEffect(() => {
    let current = true;
    if (subtotal <= 0) {
      onShippingAvailabilityChange?.(true);
      return () => { current = false; };
    }
    onShippingAvailabilityChange?.(false);
    getShippingQuote(String(subtotal)).then((result) => {
      if (!current) return;
      if (result.ok) {
        setShippingState({ subtotal, status: "available", quote: result.quote });
        onShippingAvailabilityChange?.(true);
      } else {
        setShippingState({ subtotal, status: "unavailable", quote: null });
        onShippingAvailabilityChange?.(false);
      }
    }).catch(() => {
      if (!current) return;
      setShippingState({ subtotal, status: "unavailable", quote: null });
      onShippingAvailabilityChange?.(false);
    });
    return () => { current = false; };
  }, [subtotal, onShippingAvailabilityChange]);

  const shippingStatus = shippingState.subtotal === subtotal ? shippingState.status : "loading";
  const shippingQuote = shippingState.subtotal === subtotal ? shippingState.quote : null;
  const quotedSubtotal = promotionQuote ? Number(promotionQuote.subtotal) : subtotal;
  const shippingFee = promotionQuote ? Number(promotionQuote.shippingFee) : Number(shippingQuote?.shippingFee);
  const shippingDiscount = promotionQuote ? Number(promotionQuote.shippingDiscountAmount) : Number(shippingQuote?.shippingDiscountAmount ?? 0);
  const shipping = promotionQuote ? Number(promotionQuote.shippingAmount) : Number(shippingQuote?.shippingAmount);
  const discount = promotionQuote ? Number(promotionQuote.discountAmount) : 0;
  const giftFee = giftPackagingSelected && giftPackagingFee != null ? Number(giftPackagingFee) : 0;
  const giftFeeAvailable = !giftPackagingSelected || (Number.isFinite(giftFee) && giftFee > 0);
  const baseTotal = promotionQuote ? Number(promotionQuote.totalAmount) : shippingStatus === "available" && shippingQuote
    ? Number(shippingQuote.totalAmount)
    : null;
  const total = baseTotal === null || !giftFeeAvailable ? null : baseTotal + giftFee;

  return (
    <div className="rounded-3xl bg-[var(--color-surface)] p-6 sm:p-8 border border-[var(--color-border)] shadow-sm flex flex-col gap-6">
      <h3 className="font-editorial text-xl font-bold text-[var(--color-text)]">
        Order Summary
      </h3>

      <div className="space-y-4 text-xs sm:text-sm text-[var(--color-text-secondary)]">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span>Subtotal</span>
          <span className="font-bold text-[var(--color-text)]">EGP {quotedSubtotal}</span>
        </div>

        {promotionQuote && <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[var(--color-success)]">
            <span className="min-w-0 break-words">Discount ({promotionQuote.code})</span>
            <span className="font-bold">− EGP {discount.toFixed(2)}</span>
          </div>
          <p className="text-[10px] text-[var(--color-text-secondary)]">Estimated savings only. The order service rechecks the code, usage limit, and final total when you place the order.</p>
        </>}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>Shipping fee</span>
          <span className="font-bold text-[var(--color-text)]">
            {shippingStatus === "loading" && !promotionQuote ? "Checking…" : shippingStatus === "unavailable" && !promotionQuote ? "Unavailable" : `EGP ${Number.isFinite(shippingFee) ? shippingFee.toFixed(2) : "0.00"}`}
          </span>
        </div>

        {shippingDiscount > 0 && <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[var(--color-success)]"><span>Shipping discount</span><span className="font-bold">− EGP {shippingDiscount.toFixed(2)}</span></div>}
        {giftPackagingSelected && <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"><span>Gift packaging</span><span className="font-bold text-[var(--color-text)]">{giftFeeAvailable ? `EGP ${giftFee.toFixed(2)}` : "Unavailable"}</span></div>}
        {shippingQuote?.freeShippingMinimumSubtotal && Number(shippingQuote.freeShippingMinimumSubtotal) > quotedSubtotal && <p className="text-[11px] text-[var(--color-primary)]">Add EGP {(Number(shippingQuote.freeShippingMinimumSubtotal) - quotedSubtotal).toFixed(2)} to qualify for free shipping.</p>}

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-[var(--color-border)] pt-4 text-base font-bold text-[var(--color-text)] sm:text-lg">
          <span>Total</span>
          <span>{total === null ? "Unavailable" : `EGP ${total.toFixed(2)}`}</span>
        </div>
      </div>

      {showCheckoutButton && subtotal > 0 && (
        <CartCheckoutButton href={checkoutHref} shippingAvailable={shippingStatus === "available"} />
      )}

      <div className="flex items-center gap-3 pt-2 text-[11px] text-[var(--color-text-secondary)] border-t border-[var(--color-border)]">
        <ShieldCheck className="h-5 w-5 text-[var(--color-primary)] shrink-0" />
        <span>Secure checkout backed by Dr. Beauty clinical guarantee & easy 14-day returns.</span>
      </div>
    </div>
  );
}
