export const PROMOTION_STATUS_FILTERS = ["all", "active", "scheduled", "expired", "disabled"];

export function getPromotionLifecycleStatus(promotion, now = Date.now()) {
  if (promotion?.is_active !== true) return "disabled";
  const startsAt = promotion.starts_at ? Date.parse(promotion.starts_at) : null;
  const endsAt = promotion.ends_at ? Date.parse(promotion.ends_at) : null;
  if (Number.isFinite(endsAt) && endsAt <= now) return "expired";
  if (Number.isFinite(startsAt) && startsAt > now) return "scheduled";
  return "active";
}

export function getPromotionCapacity(promotion) {
  const limit = promotion?.maximum_redemptions;
  if (limit === null || limit === undefined || !Number.isFinite(Number(limit))) {
    return { limit: null, used: Number(promotion?.redemption_counts?.capacity_count ?? 0), remaining: null, utilizationPercent: null };
  }
  const safeLimit = Math.max(0, Number(limit));
  const used = Math.max(0, Number(promotion?.redemption_counts?.capacity_count ?? 0));
  return {
    limit: safeLimit,
    used,
    remaining: Math.max(0, safeLimit - used),
    utilizationPercent: safeLimit === 0 ? 100 : Math.min(100, Math.round((used / safeLimit) * 100)),
  };
}

export function getPromotionTargetSummary(promotion, products = [], categories = []) {
  const scope = promotion?.application_scope ?? "order";
  if (scope === "order") return "Entire order";
  const productNames = (promotion?.product_target_ids ?? []).map((id) => products.find((item) => item.id === id)?.name).filter(Boolean);
  const categoryNames = (promotion?.category_target_ids ?? []).map((id) => categories.find((item) => item.id === id)?.name).filter(Boolean);
  const joinNames = (names, fallback) => names.length ? names.join(", ") : fallback;
  if (scope === "products") return `Products: ${joinNames(productNames, "Selected products")}`;
  if (scope === "categories") return `Categories: ${joinNames(categoryNames, "Selected categories")}`;
  return `Products or categories: ${joinNames(productNames, "selected products")} / ${joinNames(categoryNames, "selected categories")}`;
}

export function filterAdminPromotions(promotions, { status = "all", search = "" } = {}, now = Date.now(), targetSummaryByPromotion = {}) {
  const query = search.trim().toLocaleLowerCase();
  return (promotions ?? []).filter((promotion) => {
    if (status !== "all" && getPromotionLifecycleStatus(promotion, now) !== status) return false;
    if (!query) return true;
    const haystack = [promotion.code, promotion.title, promotion.description, promotion.discount_type,
      promotion.application_scope, promotion.first_purchase_only ? "first purchase" : "",
      promotion.tiered_discount_enabled ? "tiered" : "", promotion.is_featured ? "featured" : "",
      promotion.is_announcement ? "announcement" : "", targetSummaryByPromotion[promotion.id] ?? ""]
      .filter(Boolean).join(" ").toLocaleLowerCase();
    return haystack.includes(query);
  });
}

export function countPromotionStatuses(promotions, now = Date.now()) {
  return Object.fromEntries(["active", "scheduled", "expired", "disabled"].map((status) => [
    status,
    (promotions ?? []).filter((promotion) => getPromotionLifecycleStatus(promotion, now) === status).length,
  ]));
}
