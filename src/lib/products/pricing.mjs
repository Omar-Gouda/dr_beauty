const MONEY_PATTERN = /^\d{1,10}(?:\.\d{1,2})?$/;
const MAX_PRICE_CENTS = 999_999_999_999;

function parseCents(value, { allowZero }) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!MONEY_PATTERN.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents > MAX_PRICE_CENTS || (!allowZero && cents <= 0)) return null;
  return { cents, value: normalized };
}

export function validateProductPricing(priceInput, compareAtPriceInput) {
  const price = parseCents(priceInput, { allowZero: true });
  if (!price) {
    return { ok: false, message: "Enter a valid selling price with up to two decimal places." };
  }

  const compareInput = compareAtPriceInput == null
    ? ""
    : typeof compareAtPriceInput === "string" ? compareAtPriceInput.trim() : null;
  if (compareInput === "") {
    return { ok: true, price: price.value, compareAtPrice: null };
  }

  const compareAtPrice = parseCents(compareInput, { allowZero: false });
  if (!compareAtPrice || compareAtPrice.cents <= price.cents) {
    return {
      ok: false,
      message: "The compare-at price must be a valid amount greater than the selling price.",
    };
  }

  return { ok: true, price: price.value, compareAtPrice: compareAtPrice.value };
}

export function getProductPricing(priceInput, compareAtPriceInput = null) {
  const price = Number(priceInput);
  if (!Number.isFinite(price) || price < 0) return { price: null, compareAtPrice: null, hasCompareAtPrice: false };

  const compareAtPrice = compareAtPriceInput == null || compareAtPriceInput === ""
    ? null
    : Number(compareAtPriceInput);
  const hasCompareAtPrice = Number.isFinite(compareAtPrice) && compareAtPrice > price;

  return {
    price,
    compareAtPrice: hasCompareAtPrice ? compareAtPrice : null,
    hasCompareAtPrice,
  };
}
