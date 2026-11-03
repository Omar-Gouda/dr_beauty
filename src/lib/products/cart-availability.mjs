export function isProductAvailableForPurchase(inStock) {
  return inStock === true;
}

export function normalizeProductAvailability(productIds, rows) {
  if (!Array.isArray(productIds) || productIds.length === 0 || !Array.isArray(rows)) {
    return { verified: false, availability: {} };
  }

  const requested = new Set(productIds);
  if (requested.size !== productIds.length || productIds.some((id) => typeof id !== "string" || !id)) {
    return { verified: false, availability: {} };
  }

  const availability = {};
  for (const row of rows) {
    if (!row || typeof row.product_id !== "string" || !requested.has(row.product_id) ||
        typeof row.is_available !== "boolean" || Object.hasOwn(availability, row.product_id)) {
      return { verified: false, availability: {} };
    }
    availability[row.product_id] = row.is_available;
  }

  // The RPC intentionally omits inactive products. Treat any omitted ID as
  // unavailable; never infer availability from a missing or malformed row.
  for (const id of productIds) {
    if (!Object.hasOwn(availability, id)) availability[id] = false;
  }

  return { verified: true, availability };
}

export async function addAvailableProductToCart({ product, checkAvailability, addToCart }) {
  let result;
  try {
    result = await checkAvailability(product?.id);
  } catch {
    return { ok: false, reason: "availability_unverified" };
  }

  if (result?.verified !== true) return { ok: false, reason: "availability_unverified" };
  if (result.available !== true) return { ok: false, reason: "out_of_stock" };

  try {
    if (!addToCart(product)) return { ok: false, reason: "cart_rejected" };
    return { ok: true, reason: "added" };
  } catch {
    return { ok: false, reason: "cart_rejected" };
  }
}
