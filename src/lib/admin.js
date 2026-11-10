import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { getAdminOrderErrorCode } from "@/lib/admin-order-status.mjs";
import {
  buildAdminOrderSearchExpression,
  getAdminOrderPageCount,
  normalizeAdminOrderFilters,
} from "@/lib/admin-order-query.mjs";
import {
  buildAdminSalesSeries,
  getAdminDashboardRange,
  rankAdminProducts,
  summarizeAdminOrders,
  normalizeCairoRevenueMetrics,
} from "@/lib/admin-dashboard.mjs";
import { normalizeUserAnalytics } from "@/lib/admin-user-analytics.mjs";
import { getWhatsAppChannelUrl } from "@/lib/whatsapp/channel.mjs";

const adminProductSelection = "id,name,slug,description,ingredients,price,compare_at_price,currency,is_active,is_bestseller,category_id,brand_id,category:categories(id,name,slug),brand:brands(id,name),images:product_images(id,image_url,alt_text,sort_order,focal_x,focal_y),inventory:product_inventory(stock_quantity)";

function mapAdminProduct(product) {
  return {
    ...product,
    price: Number(product.price),
    compareAtPrice: product.compare_at_price == null ? null : Number(product.compare_at_price),
    categoryName: product.category?.name ?? "",
    brandName: product.brand?.name ?? "",
    images: (product.images ?? []).toSorted((a, b) => a.sort_order - b.sort_order),
    stockQuantity: (Array.isArray(product.inventory) ? product.inventory[0] : product.inventory)?.stock_quantity ?? 0,
  };
}

export async function getAdminAccess() {
  const missing = getMissingSupabaseEnv();
  if (missing.length) return { status: "unavailable", missing };

  try {
    const supabase = await createClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) return { status: "unavailable", missing: [] };
    if (!authData.user) return { status: "unauthenticated" };

    const { data, error } = await supabase.rpc("is_current_user_admin");
    if (error || data !== true) {
      return { status: error ? "unavailable" : "forbidden" };
    }

    return { status: "authorized", supabase, user: authData.user };
  } catch {
    return { status: "unavailable", missing: [] };
  }
}

// Admin route reads authenticate from request cookies and can reach Supabase
// Auth's expiry checks. Keep those reads out of the prerendered shell even
// when a page-level data accessor is rendered independently from its layout.
export async function getAdminRequestAccess() {
  await connection();
  return getAdminAccess();
}

function classifyAdminNotificationFailure(error, code) {
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  if (code === "42P01" || code === "PGRST205" || (message.includes("schema cache") && message.includes("table"))) {
    return "migration_missing";
  }
  if (code === "42703" || code === "PGRST200" || code === "PGRST204" || message.includes("relationship") || message.includes("column")) {
    return "schema_mismatch";
  }
  if (code === "42501" || code === "PGRST301" || message.includes("permission denied") || message.includes("row-level security")) {
    return "permission_denied";
  }
  return "unavailable";
}

export async function getAdminNotifications(supabase, userId) {
  const { data, error } = await supabase
    .from("admin_notifications")
    .select("id,event_type,service_request_id,created_at,read_at,order:orders!admin_notifications_order_id_fkey(order_number),service_request:customer_service_requests!admin_notifications_service_request_id_fkey(request_type,category)")
    .eq("recipient_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    const code = typeof error.code === "string" && /^[A-Z0-9]{3,12}$/.test(error.code) ? error.code : "unknown";
    const reason = classifyAdminNotificationFailure(error, code);
    // Log primitive, allowlisted diagnostics. Avoid serializing the provider's
    // error object, which can be rendered as `{}` by some server loggers and
    // may contain query or customer data.
    console.error(`[admin-notifications] read failed code=${code} category=${reason}`);
    return { data: null, error: reason };
  }
  return {
    data: (data ?? []).map((notification) => ({
      ...notification,
      orderNumber: notification.order?.order_number ?? null,
      requestId: notification.service_request_id ?? null,
      requestType: notification.service_request?.request_type ?? null,
      requestCategory: notification.service_request?.category ?? null,
      createdLabel: new Intl.DateTimeFormat("en-EG", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(notification.created_at)),
    })),
    error: null,
  };
}

export async function getAdminProducts() {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") return { data: null, error: "Admin access or database configuration is unavailable." };

  const { data, error } = await access.supabase
    .from("products")
    .select(adminProductSelection)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return { data: null, error: "Products could not be loaded. Check that the admin migration is applied and the database is configured." };
  return { data: (data ?? []).map(mapAdminProduct), error: null };
}

export async function getAdminProductBySlug(slug) {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") {
    return { data: null, error: "Admin access or database configuration is unavailable." };
  }

  const { data, error } = await access.supabase
    .from("products")
    .select(adminProductSelection)
    .eq("slug", slug)
    .maybeSingle();

  if (error) return { data: null, error: "The product could not be loaded. Please try again." };
  return { data: data ? mapAdminProduct(data) : null, error: null };
}

export async function getAdminCategories() {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") return { data: null, error: "Admin access or database configuration is unavailable." };
  const { data, error } = await access.supabase
    .from("categories")
    .select("id,name,slug,description,image_url,sort_order,is_active,created_at")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) return { data: null, error: "Categories could not be loaded. Check that the admin migration is applied and the database is configured." };
  return { data: data ?? [], error: null };
}

export async function getAdminPromotions() {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") return { data: null, error: "Admin access or database configuration is unavailable." };
  const [
    { data, error },
    { data: redemptionCounts, error: countsError },
    { data: productTargets, error: productTargetsError },
    { data: categoryTargets, error: categoryTargetsError },
    { data: discountTiers, error: tiersError },
    { data: productOptions, error: productOptionsError },
    { data: categoryOptions, error: categoryOptionsError },
  ] = await Promise.all([
    access.supabase
      .from("promotions")
      .select("id,code,title,description,discount_type,discount_value,maximum_discount,minimum_subtotal,starts_at,ends_at,maximum_redemptions,per_account_redemption_limit,first_purchase_only,application_scope,tiered_discount_enabled,is_active,is_featured,display_priority,target_path,is_announcement,announcement_priority,created_at,updated_at")
      .order("created_at", { ascending: false }),
    access.supabase.rpc("get_admin_promotion_redemption_counts"),
    access.supabase.from("promotion_product_targets").select("promotion_id,product_id"),
    access.supabase.from("promotion_category_targets").select("promotion_id,category_id"),
    access.supabase.from("promotion_discount_tiers").select("promotion_id,id,minimum_subtotal,discount_type,discount_value,maximum_discount").order("minimum_subtotal", { ascending: true }),
    access.supabase.from("products").select("id,name,slug,is_active").order("name", { ascending: true }),
    access.supabase.from("categories").select("id,name,slug,is_active").order("sort_order", { ascending: true }).order("name", { ascending: true }),
  ]);
  if (error) return { data: null, error: "Discount codes could not be loaded. Check the promotions table and admin access." };
  if (countsError || !Array.isArray(redemptionCounts)) {
    return { data: null, error: "Promotion redemption analytics could not be loaded. Check the admin database migration and access." };
  }
  if (productTargetsError || categoryTargetsError || tiersError || productOptionsError || categoryOptionsError ||
      !Array.isArray(productTargets) || !Array.isArray(categoryTargets) ||
      !Array.isArray(discountTiers) ||
      !Array.isArray(productOptions) || !Array.isArray(categoryOptions)) {
    return { data: null, error: "Promotion target data could not be loaded. Check the Phase 2A migration and admin access." };
  }
  const countsByPromotion = new Map(redemptionCounts.map((counts) => [counts.promotion_id, counts]));
  const productTargetsByPromotion = new Map();
  for (const target of productTargets) {
    const current = productTargetsByPromotion.get(target.promotion_id) ?? [];
    current.push(target.product_id);
    productTargetsByPromotion.set(target.promotion_id, current);
  }
  const categoryTargetsByPromotion = new Map();
  for (const target of categoryTargets) {
    const current = categoryTargetsByPromotion.get(target.promotion_id) ?? [];
    current.push(target.category_id);
    categoryTargetsByPromotion.set(target.promotion_id, current);
  }
  const tiersByPromotion = new Map();
  for (const tier of discountTiers) {
    const current = tiersByPromotion.get(tier.promotion_id) ?? [];
    current.push(tier);
    tiersByPromotion.set(tier.promotion_id, current);
  }
  return {
    data: (data ?? []).map((promotion) => ({
      ...promotion,
      product_target_ids: productTargetsByPromotion.get(promotion.id) ?? [],
      category_target_ids: categoryTargetsByPromotion.get(promotion.id) ?? [],
      discount_tiers: tiersByPromotion.get(promotion.id) ?? [],
      redemption_counts: countsByPromotion.get(promotion.id) ?? {
        total_records: 0,
        capacity_count: 0,
        reserved_count: 0,
        redeemed_count: 0,
        cancelled_count: 0,
        refunded_count: 0,
        released_count: 0,
      },
    })),
    productOptions,
    categoryOptions,
    error: null,
  };
}

export async function getAdminShippingSettings() {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") return { data: null, error: "Admin access or database configuration is unavailable." };
  const { data, error } = await access.supabase.from("shipping_settings")
    .select("id,is_shipping_enabled,default_fee,free_shipping_minimum_subtotal,gift_packaging_fee,updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error || !data) return { data: null, error: "Shipping settings are unavailable. Apply the shipping configuration migration before editing these settings." };
  return { data, error: null };
}

export async function getAdminProductReviews() {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") return { data: null, error: "Admin access or database configuration is unavailable." };

  const { data, error } = await access.supabase
    .from("product_reviews")
    .select("id,rating,title,body,status,created_at,product:products(name)")
    .in("status", ["pending", "approved"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return { data: null, error: "Reviews could not be loaded. Please try again later." };
  return { data: data ?? [], error: null };
}

async function fetchAdminRowsInRange(makeQuery, start, end, maximumRows = 10000) {
  const pageSize = 1000;
  const first = await makeQuery()
    .gte("created_at", start)
    .lt("created_at", end)
    .range(0, pageSize - 1);
  if (first.error) return { data: null, error: true, oversized: false };
  const count = first.count ?? first.data?.length ?? 0;
  if (count > maximumRows) return { data: null, error: false, oversized: true };
  const pages = Math.ceil(count / pageSize);
  if (pages <= 1) return { data: first.data ?? [], error: false, oversized: false };
  const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => makeQuery()
    .gte("created_at", start)
    .lt("created_at", end)
    .range((index + 1) * pageSize, (index + 2) * pageSize - 1)));
  if (remaining.some((page) => page.error)) return { data: null, error: true, oversized: false };
  return { data: [...(first.data ?? []), ...remaining.flatMap((page) => page.data ?? [])], error: false, oversized: false };
}

async function fetchAdminOrderItemsInRange(db, start, end) {
  const makeQuery = () => db.from("order_items")
    .select("id,order_id,product_id,product_name_snapshot,product_slug_snapshot,unit_price,quantity,line_total,promotion_discount_amount,order_row:orders!inner(created_at,order_status,payment_status,discount_amount)", { count: "exact" })
    .eq("order_row.order_status", "delivered")
    .neq("order_row.payment_status", "refunded")
    .order("id", { ascending: true });
  const pageSize = 1000;
  const first = await makeQuery().gte("order_row.created_at", start).lt("order_row.created_at", end).range(0, pageSize - 1);
  if (first.error) return { data: null, error: true, oversized: false };
  const count = first.count ?? first.data?.length ?? 0;
  if (count > 10000) return { data: null, error: false, oversized: true };
  const pages = Math.ceil(count / pageSize);
  if (pages <= 1) return { data: first.data ?? [], error: false, oversized: false };
  const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => makeQuery()
    .gte("order_row.created_at", start)
    .lt("order_row.created_at", end)
    .range((index + 1) * pageSize, (index + 2) * pageSize - 1)));
  if (remaining.some((page) => page.error)) return { data: null, error: true, oversized: false };
  return { data: [...(first.data ?? []), ...remaining.flatMap((page) => page.data ?? [])], error: false, oversized: false };
}

export async function getAdminDashboardData(input = {}) {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") return { unavailable: true };
  const db = access.supabase;
  const range = getAdminDashboardRange(input);
  const from = new Date(range.previousStart) < new Date(range.start) ? range.previousStart : range.start;
  const windowEnd = range.end;
  const [ordersResult, totalOrders, pendingNow, outOfStockCount, outOfStockProducts, productsCount, activeCatalogResult, categoriesCount, recentOrdersResult, pendingOrdersResult, adminNotifications, recentReviews, recentRequests, itemsResult, userAnalyticsResult, announcementsResult, cairoRevenueResult, promotionsResult, redemptionCountsResult, rankingVisibilityResult, receiptArchiveResult] = await Promise.all([
    fetchAdminRowsInRange(() => db.from("orders").select("id,order_number,created_at,order_status,payment_status,total_amount", { count: "exact" }).order("created_at", { ascending: true }).order("id", { ascending: true }), from, windowEnd),
    db.from("orders").select("id", { count: "exact", head: true }).neq("order_status", "cancelled"),
    db.from("orders").select("id", { count: "exact", head: true }).eq("order_status", "pending_confirmation"),
    db.from("product_inventory").select("product_id", { count: "exact", head: true }).eq("stock_quantity", 0),
    db.from("product_inventory").select("product:products(id,name,slug,images:product_images(image_url,sort_order))").eq("stock_quantity", 0).order("updated_at", { ascending: false }).limit(6),
    db.from("products").select("id", { count: "exact", head: true }),
    db.from("products").select("id,name,slug", { count: "exact" }).eq("is_active", true).order("name", { ascending: true }).limit(1000),
    db.from("categories").select("id", { count: "exact", head: true }),
    db.from("orders").select("id,order_number,total_amount,order_status,payment_status,created_at").order("created_at", { ascending: false }).limit(6),
    db.from("orders").select("id,order_number,total_amount,created_at").eq("order_status", "pending_confirmation").order("created_at", { ascending: true }).limit(5),
    getAdminNotifications(db, access.user.id),
    db.from("product_reviews").select("id,rating,created_at,product:products(name)").in("status", ["pending", "approved"]).order("created_at", { ascending: false }).limit(4),
    db.from("customer_service_requests").select("id,request_type,category,created_at").order("created_at", { ascending: false }).limit(4),
    fetchAdminOrderItemsInRange(db, range.start, range.end),
    db.rpc("get_admin_user_dashboard_metrics"),
    db.rpc("get_public_discount_announcements"),
    db.rpc("get_admin_cairo_revenue_metrics"),
    db.from("promotions").select("id,code,title,description,discount_type,discount_value,maximum_discount,minimum_subtotal,starts_at,ends_at,maximum_redemptions,per_account_redemption_limit,first_purchase_only,application_scope,tiered_discount_enabled,is_active").order("created_at", { ascending: false }),
    db.rpc("get_admin_promotion_redemption_counts"),
    db.from("storefront_ranking_settings").select("show_loved_by_dr_beauty,show_dr_beauty_elites").maybeSingle(),
    db.rpc("admin_receipt_archive_overview"),
  ]);

  if (ordersResult.error) {
    return { unavailable: false, range, error: "Order analytics could not be loaded. Verify admin database access and retry." };
  }
  const orderRows = ordersResult.data ?? [];
  const currentRows = orderRows.filter((order) => Date.parse(order.created_at) >= Date.parse(range.start) && Date.parse(order.created_at) < Date.parse(range.end));
  const previousRows = orderRows.filter((order) => Date.parse(order.created_at) >= Date.parse(range.previousStart) && Date.parse(order.created_at) < Date.parse(range.previousEnd));
  const current = summarizeAdminOrders(currentRows);
  const previous = summarizeAdminOrders(previousRows);
  const orderAnalyticsAvailable = !ordersResult.oversized;
  const series = buildAdminSalesSeries(currentRows, range);
  const previousSeries = buildAdminSalesSeries(previousRows, { ...range, start: range.previousStart, end: range.previousEnd });
  const items = itemsResult.data ?? [];
  const validItems = itemsResult.data !== null && !itemsResult.error && !itemsResult.oversized;
  const topByQuantity = validItems ? rankAdminProducts(items, 5, "quantity") : null;
  const productRevenueAvailable = validItems && !items.some((item) => Number(item.order_row?.discount_amount) > 0 && item.promotion_discount_amount == null);
  const topByRevenue = productRevenueAvailable ? rankAdminProducts(items, 5, "revenue") : null;
  const topProductIds = [...new Set([...(topByQuantity ?? []), ...(topByRevenue ?? [])].map((item) => item.productId).filter(Boolean))];
  let imagesByProduct = new Map();
  if (topProductIds.length) {
    const { data: productImages, error: productImagesError } = await db.from("products")
      .select("id,images:product_images(image_url,sort_order)")
      .in("id", topProductIds);
    if (!productImagesError) {
      imagesByProduct = new Map((productImages ?? []).map((product) => [
        product.id,
        (product.images ?? []).toSorted((a, b) => a.sort_order - b.sort_order)[0]?.image_url ?? null,
      ]));
    }
  }
  const soldProductIds = new Set((itemsResult.data ?? []).map((item) => item.product_id).filter(Boolean));
  const noSalesProducts = validItems && !activeCatalogResult.error && (activeCatalogResult.count ?? 0) <= 1000
    ? (activeCatalogResult.data ?? []).filter((product) => !soldProductIds.has(product.id)).slice(0, 5)
    : null;
  const statusCounts = current.statuses;
  const terminalCount = statusCounts.delivered + statusCounts.cancelled;
  const completionRate = terminalCount ? statusCounts.delivered / terminalCount * 100 : null;
  const recentActivity = [];
  for (const notification of adminNotifications.data ?? []) {
    recentActivity.push({
      id: `notification-${notification.id}`,
      notificationId: notification.id,
      type: notification.event_type,
      createdAt: notification.created_at,
      readAt: notification.read_at,
      orderNumber: notification.orderNumber,
      requestId: notification.requestId,
      requestType: notification.requestType,
    });
  }
  const notifiedRequestIds = new Set((adminNotifications.data ?? []).map((notification) => notification.requestId).filter(Boolean));
  for (const review of recentReviews.data ?? []) {
    recentActivity.push({ id: `review-${review.id}`, type: "new_review", createdAt: review.created_at, title: review.product?.name ?? "Product review", detail: `${review.rating} / 5 rating`, href: "/admin/reviews" });
  }
  for (const request of recentRequests.data ?? []) {
    if (notifiedRequestIds.has(request.id)) continue;
    recentActivity.push({ id: `request-${request.id}`, type: request.request_type, createdAt: request.created_at, detail: request.category, requestId: request.id, href: `/admin/requests#request-${request.id}` });
  }
  recentActivity.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  const visitorTrackingReady = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY && (process.env.VISITOR_TRACKING_SECRET ?? "").length >= 32);
  const userAnalytics = userAnalyticsResult.error
    ? null
    : normalizeUserAnalytics(userAnalyticsResult.data, { visitorTrackingReady });
  const promotionCountsById = new Map((Array.isArray(redemptionCountsResult.data) ? redemptionCountsResult.data : []).map((row) => [row.promotion_id, row]));
  const availablePromotions = promotionsResult.error || !Array.isArray(promotionsResult.data) || redemptionCountsResult.error || !Array.isArray(redemptionCountsResult.data)
    ? null
    : promotionsResult.data.map((promotion) => ({
      ...promotion,
      redemption_counts: promotionCountsById.get(promotion.id) ?? {
        total_records: 0, capacity_count: 0, reserved_count: 0, redeemed_count: 0,
        cancelled_count: 0, refunded_count: 0, released_count: 0,
      },
    }));

  return {
    unavailable: false,
    asOf: new Date().toISOString(),
    range,
    rangeError: range.error,
    historyWarning: range.historyMayBeIncomplete,
    analyticsError: Boolean(ordersResult.oversized),
    itemAnalyticsError: Boolean(itemsResult.error || itemsResult.oversized),
    metrics: {
      cairoRevenue: cairoRevenueResult.error ? null : normalizeCairoRevenueMetrics(cairoRevenueResult.data),
      cairoRevenueError: Boolean(cairoRevenueResult.error || !normalizeCairoRevenueMetrics(cairoRevenueResult.data)),
      totalRevenue: orderAnalyticsAvailable ? current.revenue : null,
      previousRevenue: orderAnalyticsAvailable ? previous.revenue : null,
      collectedRevenue: orderAnalyticsAvailable ? current.collectedRevenue : null,
      previousCollectedRevenue: orderAnalyticsAvailable ? previous.collectedRevenue : null,
      averageOrderValue: orderAnalyticsAvailable ? current.averageOrderValue : null,
      previousAverageOrderValue: orderAnalyticsAvailable ? previous.averageOrderValue : null,
      orders: totalOrders.error ? null : totalOrders.count,
      periodOrders: orderAnalyticsAvailable ? current.orderCount : null,
      previousPeriodOrders: orderAnalyticsAvailable ? previous.orderCount : null,
      pendingOrders: pendingNow.error ? null : pendingNow.count,
      newCustomers: userAnalytics?.newUsers ?? null,
      previousNewCustomers: null,
      customerAccounts: userAnalytics?.totalUsers ?? null,
      customerAnalyticsAvailable: Boolean(userAnalytics),
      statusCounts: orderAnalyticsAvailable ? statusCounts : null,
      completionRate: orderAnalyticsAvailable ? completionRate : null,
      cancelledOrders: orderAnalyticsAvailable ? statusCounts.cancelled : null,
      products: productsCount.error ? null : productsCount.count,
      categories: categoriesCount.error ? null : categoriesCount.count,
      stockUnits: null,
      outOfStock: outOfStockCount.error ? null : outOfStockCount.count,
      lowStock: null,
    },
    recentOrders: recentOrdersResult.error ? null : recentOrdersResult.data ?? [],
    pendingOrders: pendingOrdersResult.error ? null : pendingOrdersResult.data ?? [],
    outOfStockProducts: outOfStockProducts.error ? null : (outOfStockProducts.data ?? []).map((row) => row.product).filter(Boolean),
    topProductsByQuantity: topByQuantity?.map((item) => ({ ...item, image: imagesByProduct.get(item.productId) ?? null })) ?? null,
    topProductsByRevenue: topByRevenue?.map((item) => ({ ...item, image: imagesByProduct.get(item.productId) ?? null })) ?? null,
    productRevenueAvailable,
    noSalesProducts,
    series: ordersResult.oversized ? null : series,
    previousSeries: ordersResult.oversized ? null : previousSeries,
    currentPeriod: orderAnalyticsAvailable ? current : null,
    previousPeriod: orderAnalyticsAvailable ? previous : null,
    recentActivity: recentActivity.slice(0, 10),
    activityPartial: Boolean(adminNotifications.error || recentReviews.error || recentRequests.error),
    inventoryAggregateAvailable: false,
    userAnalytics,
    userAnalyticsError: userAnalyticsResult.error ? "User analytics could not be loaded. Check that the local dashboard analytics migration is applied and admin access is valid." : null,
    rankingVisibilitySettings: rankingVisibilityResult.error || !rankingVisibilityResult.data ? null : {
      showLovedByDrBeauty: rankingVisibilityResult.data.show_loved_by_dr_beauty === true,
      showDrBeautyElites: rankingVisibilityResult.data.show_dr_beauty_elites === true,
    },
    announcements: announcementsResult.error || !Array.isArray(announcementsResult.data) ? null : announcementsResult.data,
    announcementsError: Boolean(announcementsResult.error || !Array.isArray(announcementsResult.data)),
    availablePromotions,
    availablePromotionsError: availablePromotions === null,
    receiptArchive: receiptArchiveResult.error || !receiptArchiveResult.data ? null : receiptArchiveResult.data,
    receiptArchiveError: Boolean(receiptArchiveResult.error || !receiptArchiveResult.data),
    whatsappChannelUrl: getWhatsAppChannelUrl(),
  };
}

export async function getAdminOrders(input = {}) {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") return { data: null, error: "Admin access or database configuration is unavailable." };
  const filters = normalizeAdminOrderFilters(input);
  const applyFilters = (query) => {
    if (filters.status !== "all") query = query.eq("order_status", filters.status);
    const searchExpression = buildAdminOrderSearchExpression(filters.search);
    if (searchExpression) query = query.or(searchExpression);
    return query;
  };
  const fetchPage = (page) => applyFilters(access.supabase
    .from("orders")
    .select("id,order_number,customer_name,customer_email,customer_phone,governorate,city,address_line,delivery_notes,payment_method,payment_status,order_status,subtotal,shipping_amount,shipping_fee_amount,shipping_discount_amount,discount_amount,total_amount,currency,promotion_code_snapshot,created_at,shipping_carrier,tracking_number,tracking_url,shipped_at,status_changed_at,items:order_items(id,product_name_snapshot,product_slug_snapshot,unit_price,quantity,line_total,promotion_discount_amount)", { count: "exact" }))
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range((page - 1) * filters.pageSize, page * filters.pageSize - 1);

  let { data, error, count } = await fetchPage(filters.page);
  if (error) return { data: null, error: "Orders could not be loaded. Check that the admin migration is applied and the database is configured." };
  const totalCount = count ?? data?.length ?? 0;
  const totalPages = getAdminOrderPageCount(totalCount, filters.pageSize);
  const page = Math.min(filters.page, totalPages);
  if (page !== filters.page) {
    ({ data, error } = await fetchPage(page));
    if (error) return { data: null, error: "Orders could not be loaded. Check that the admin migration is applied and the database is configured." };
  }
  const orders = data ?? [];
  const pagination = { page, pageSize: filters.pageSize, totalCount, totalPages };
  if (orders.length === 0) return { data: [], error: null, historyUnavailable: false, filters, pagination };

  let history;
  let historyError;
  try {
    ({ data: history, error: historyError } = await access.supabase.rpc("get_admin_order_status_history", {
      p_order_ids: orders.map((order) => order.id),
    }));
  } catch {
    historyError = { code: "transport" };
  }
  if (historyError || !Array.isArray(history)) {
    const code = historyError ? getAdminOrderErrorCode(historyError) : "invalid_response";
    console.error(`[admin-orders] status history unavailable code=${code}`);
    return {
      data: orders.map((order) => ({ ...order, statusHistory: null })),
      error: null,
      historyUnavailable: true,
      filters,
      pagination,
    };
  }

  const historyByOrder = new Map();
  for (const event of history) {
    const events = historyByOrder.get(event.order_id) ?? [];
    events.push(event);
    historyByOrder.set(event.order_id, events);
  }
  return {
    data: orders.map((order) => ({ ...order, statusHistory: historyByOrder.get(order.id) ?? [] })),
    error: null,
    historyUnavailable: false,
    filters,
    pagination,
  };
}

export async function getAdminServiceRequests() {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") return { data: null, error: "Admin access is unavailable." };

  const { data, error } = await access.supabase
    .from("customer_service_requests")
    .select("id,request_type,category,question,preferred_contact_method,contact_value,status,created_at,updated_at,product:products(name,slug),order:orders(order_number,order_status)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    const code = typeof error.code === "string" && /^[A-Z0-9]{3,12}$/.test(error.code) ? error.code : "unknown";
    console.error(`[admin-service-requests] read failed code=${code}`);
    return { data: null, error: "Customer requests could not be loaded. Check that the request migration is applied." };
  }
  if (!data?.length) return { data: [], error: null };

  const { data: notes, error: notesError } = await access.supabase
    .from("customer_service_request_notes")
    .select("request_id,notes")
    .in("request_id", data.map((request) => request.id));
  if (notesError) {
    const code = typeof notesError.code === "string" && /^[A-Z0-9]{3,12}$/.test(notesError.code) ? notesError.code : "unknown";
    console.error(`[admin-service-requests] notes read failed code=${code}`);
    return { data: null, error: "Internal request notes could not be loaded. Check that the request migration is applied." };
  }
  const notesByRequest = new Map((notes ?? []).map((row) => [row.request_id, row.notes ?? ""]));
  return { data: data.map((request) => ({ ...request, admin_notes: notesByRequest.get(request.id) ?? "" })), error: null };
}
