function toCents(value) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function getOrderItemFinancials(item) {
  const originalSubtotalCents = toCents(item?.line_total);
  if (originalSubtotalCents === null) return null;
  if (item?.promotion_discount_amount === null || item?.promotion_discount_amount === undefined) {
    return { originalSubtotalCents, promotionDiscountCents: null, finalItemTotalCents: null, allocationAvailable: false };
  }
  const promotionDiscountCents = toCents(item.promotion_discount_amount);
  if (promotionDiscountCents === null || promotionDiscountCents > originalSubtotalCents) return null;
  return {
    originalSubtotalCents,
    promotionDiscountCents,
    finalItemTotalCents: originalSubtotalCents - promotionDiscountCents,
    allocationAvailable: true,
  };
}
