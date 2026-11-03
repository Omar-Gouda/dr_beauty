export function parseMoneyCents(value, { allowZero = true } = {}) {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || (!allowZero && cents === 0)) return null;
  return cents;
}

export function calculatePromotionDiscountCents(subtotalCents, promotion) {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0 || !promotion) return null;
  const valueCents = parseMoneyCents(promotion.discount_value, { allowZero: false });
  const minimumCents = parseMoneyCents(promotion.minimum_subtotal ?? "0");
  const maximumCents = promotion.maximum_discount == null
    ? null
    : parseMoneyCents(promotion.maximum_discount, { allowZero: false });
  if (valueCents === null || minimumCents === null ||
      (promotion.maximum_discount != null && maximumCents === null) || subtotalCents < minimumCents) return null;

  let discountCents;
  if (promotion.discount_type === "percentage") {
    if (valueCents > 10000) return null;
    // discount_value is stored to two decimal places, so its cents represent
    // percentage basis points. Round positive values like PostgreSQL numeric.
    const numerator = BigInt(subtotalCents) * BigInt(valueCents);
    discountCents = Number((numerator + 5000n) / 10000n);
  } else if (promotion.discount_type === "fixed_amount") {
    discountCents = valueCents;
  } else {
    return null;
  }

  if (maximumCents !== null) discountCents = Math.min(discountCents, maximumCents);
  return Math.min(discountCents, subtotalCents);
}

export function getPromotionCodeSubmissionState(code, quote, cartSignature) {
  const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!normalizedCode) return "none";
  if (!quote || quote.code !== normalizedCode) return "must_apply";
  if (quote.signature !== cartSignature) return "stale";
  return "applied";
}

export function calculateShippingBreakdownCents(subtotalCents, settings) {
  if (!Number.isSafeInteger(subtotalCents) || subtotalCents < 0 || !settings?.is_shipping_enabled) return null;
  const feeCents = parseMoneyCents(settings.default_fee);
  const minimumCents = settings.free_shipping_minimum_subtotal == null
    ? null
    : parseMoneyCents(settings.free_shipping_minimum_subtotal);
  if (feeCents === null || (settings.free_shipping_minimum_subtotal != null && minimumCents === null)) return null;
  const discountCents = minimumCents !== null && subtotalCents > minimumCents ? feeCents : 0;
  return {
    shippingFeeCents: feeCents,
    shippingDiscountCents: discountCents,
    shippingAmountCents: feeCents - discountCents,
    freeShippingMinimumCents: minimumCents,
    totalAmountCents: subtotalCents + feeCents - discountCents,
  };
}
