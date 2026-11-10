const MONEY_PATTERN = /^(?=.*[1-9])\d{1,10}(?:\.\d{1,2})?$/;
const ZERO_MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;

export function validatePromotionTiers(value, enabled) {
  if (typeof enabled !== "boolean" || !Array.isArray(value) || value.length > 25) return null;
  if (!enabled && value.length === 0) return [];
  if (enabled && value.length === 0) return null;

  const tiers = [];
  const thresholds = new Set();
  for (const tier of value) {
    const minimumSubtotal = String(tier?.minimumSubtotal ?? "").trim();
    const discountType = tier?.discountType;
    const discountValue = String(tier?.discountValue ?? "").trim();
    const maximumDiscount = tier?.maximumDiscount == null || tier.maximumDiscount === ""
      ? null
      : String(tier.maximumDiscount).trim();
    const thresholdCents = parseMoneyCents(minimumSubtotal, true);
    if (thresholdCents === null || thresholds.has(thresholdCents) ||
        !["percentage", "fixed_amount"].includes(discountType) ||
        !MONEY_PATTERN.test(discountValue) ||
        (discountType === "percentage" && Number(discountValue) > 100) ||
        (maximumDiscount !== null && !MONEY_PATTERN.test(maximumDiscount))) return null;
    thresholds.add(thresholdCents);
    tiers.push({ minimumSubtotal, discountType, discountValue, maximumDiscount });
  }
  return tiers;
}

export function parseMoneyCents(value, allowZero = false) {
  if (typeof value !== "string" || !(allowZero ? ZERO_MONEY_PATTERN : MONEY_PATTERN).test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function calculateTierDiscountCents(eligibleSubtotalCents, tiers, promotion = {}) {
  if (!Number.isSafeInteger(eligibleSubtotalCents) || eligibleSubtotalCents < 0 || !Array.isArray(tiers)) return null;
  const qualifying = tiers
    .filter((tier) => parseMoneyCents(String(tier.minimumSubtotal), true) <= eligibleSubtotalCents)
    .sort((left, right) => parseMoneyCents(String(right.minimumSubtotal), true) - parseMoneyCents(String(left.minimumSubtotal), true));
  const tier = qualifying[0];
  if (!tier) return null;

  const value = Number(tier.discountValue);
  let discount = tier.discountType === "percentage"
    ? Math.round((eligibleSubtotalCents * value) / 100)
    : parseMoneyCents(String(tier.discountValue));
  const caps = [tier.maximumDiscount, promotion.maximum_discount]
    .filter((cap) => cap != null && cap !== "")
    .map((cap) => parseMoneyCents(String(cap)));
  if (caps.some((cap) => cap === null)) return null;
  for (const cap of caps) discount = Math.min(discount, cap);
  discount = Math.min(discount, eligibleSubtotalCents);
  return Number.isSafeInteger(discount) && discount >= 0 ? discount : null;
}
