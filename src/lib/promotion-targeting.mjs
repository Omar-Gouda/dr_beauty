import { calculatePromotionDiscountCents, parseMoneyCents } from "./promotions.mjs";

const VALID_SCOPES = new Set(["order", "products", "categories", "product_and_category"]);

export function calculateEligiblePromotionAmounts({ items, products, scope, productTargetIds = [], categoryTargetIds = [] }) {
  if (!Array.isArray(items) || !Array.isArray(products) || !VALID_SCOPES.has(scope)) return null;
  const productById = new Map(products.map((product) => [product.id, product]));
  const productTargets = new Set(productTargetIds);
  const categoryTargets = new Set(categoryTargetIds);
  let subtotalCents = 0;
  let eligibleSubtotalCents = 0;

  for (const item of items) {
    const product = productById.get(item.product_id);
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1) return null;
    const priceCents = parseMoneyCents(product.price);
    if (priceCents === null) return null;
    const lineCents = priceCents * item.quantity;
    if (!Number.isSafeInteger(lineCents) || !Number.isSafeInteger(subtotalCents + lineCents)) return null;
    subtotalCents += lineCents;

    const productMatch = productTargets.has(product.id);
    const categoryMatch = categoryTargets.has(product.category_id);
    const eligible = scope === "order" ||
      (scope === "products" && productMatch) ||
      (scope === "categories" && categoryMatch) ||
      (scope === "product_and_category" && (productMatch || categoryMatch));
    if (eligible) eligibleSubtotalCents += lineCents;
  }

  return { subtotalCents, eligibleSubtotalCents };
}

export function calculateEligiblePromotionDiscountCents(amounts, promotion) {
  if (!amounts || !promotion || amounts.eligibleSubtotalCents <= 0) return null;
  return calculatePromotionDiscountCents(amounts.eligibleSubtotalCents, promotion);
}
