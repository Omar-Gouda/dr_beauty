import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { catalogPaginationSummary, DEFAULT_CATALOG_PAGE_SIZE, MAX_CATALOG_PAGE, MAX_CATALOG_PAGE_SIZE } from "@/lib/catalog-pagination.mjs";
import { formatImageObjectPosition } from "@/lib/products/product-form.mjs";

const productCardSelection = [
  "id",
  "category_id",
  "slug",
  "name",
  "price",
  "compare_at_price",
  "currency",
  "is_bestseller",
  "category:categories!products_category_id_fkey(slug,name)",
  "brand:brands!products_brand_id_fkey(name)",
  "images:product_images(image_url,sort_order,focal_x,focal_y)",
].join(",");

const productSearchSelection = [
  productCardSelection,
  "description",
  "ingredients",
].join(",");

function unavailableResult() {
  const missing = getMissingSupabaseEnv();
  return {
    data: null,
    error: missing.length
      ? `Catalog is unavailable. Missing Supabase configuration: ${missing.join(", ")}.`
      : "The catalog is temporarily unavailable. Please try again later.",
  };
}

function mapProduct(row, inStock = null, imageFocalPoints = null) {
  const sortedImages = (row.images ?? []).toSorted((a, b) => a.sort_order - b.sort_order);
  const images = sortedImages.map((image) => image.image_url);
  const imagePositions = sortedImages.map((image) => formatImageObjectPosition(
    imageFocalPoints?.get(row.id)?.get(image.sort_order) ?? image,
  ));
  return {
    id: row.id,
    categoryId: row.category_id,
    category: row.category?.slug ?? "",
    categoryName: row.category?.name ?? "",
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    ingredients: row.ingredients ?? "",
    price: Number(row.price),
    compareAtPrice: row.compare_at_price == null ? null : Number(row.compare_at_price),
    currency: row.currency,
    brand: row.brand?.name ?? "",
    images,
    imagePositions,
    rating: null,
    reviews: null,
    approvedReviews: [],
    approvedReviewsAvailable: true,
    isBestseller: row.is_bestseller,
    inStock,
  };
}

async function loadImageFocalPoints(supabase, productIds) {
  if (productIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("product_images")
    .select("product_id,sort_order,focal_x,focal_y")
    .in("product_id", productIds);
  if (error) return null;
  const focalPoints = new Map();
  for (const image of data ?? []) {
    if (!focalPoints.has(image.product_id)) focalPoints.set(image.product_id, new Map());
    focalPoints.get(image.product_id).set(image.sort_order, image);
  }
  return focalPoints;
}

async function loadProductAvailability(supabase, productIds) {
  const availability = new Map();
  for (let offset = 0; offset < productIds.length; offset += 500) {
    const batch = productIds.slice(offset, offset + 500);
    const { data, error } = await supabase.rpc("get_public_product_availability", {
      p_product_ids: batch,
    });
    if (error || !Array.isArray(data)) return null;
    for (const row of data) {
      if (typeof row?.product_id === "string" && typeof row?.is_available === "boolean") {
        availability.set(row.product_id, row.is_available);
      }
    }
    for (const productId of batch) {
      if (!availability.has(productId)) availability.set(productId, false);
    }
  }
  return availability;
}

async function loadApprovedReviewStats(supabase, productIds) {
  const stats = new Map(productIds.map((id) => [id, { total: 0, count: 0 }]));
  if (productIds.length === 0) return { stats, error: false };

  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("product_reviews")
      .select("id,product_id,rating")
      .eq("status", "approved")
      .in("product_id", productIds)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) return { stats: null, error: true };
    for (const review of data ?? []) {
      const aggregate = stats.get(review.product_id);
      if (!aggregate) continue;
      aggregate.total += review.rating;
      aggregate.count += 1;
    }

    if ((data ?? []).length < pageSize) break;
    offset += pageSize;
  }

  return { stats, error: false };
}

function withReviewStats(product, stats) {
  const aggregate = stats?.get(product.id);
  if (!aggregate) return { ...product, rating: null, reviews: null };
  return {
    ...product,
    rating: aggregate.count ? Number((aggregate.total / aggregate.count).toFixed(1)) : null,
    reviews: aggregate.count,
  };
}

async function loadLatestApprovedReviews(supabase, productId) {
  const { data, error } = await supabase
    .from("product_reviews")
    .select("id,rating,title,body,created_at")
    .eq("product_id", productId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(50);

  return { data: error ? null : data ?? [], error: Boolean(error) };
}

function mapCategory(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? "",
    imageUrl: row.image_url ?? null,
    sortOrder: row.sort_order,
  };
}

async function getSupabase() {
  if (getMissingSupabaseEnv().length) return null;
  return createClient();
}

export async function getPublicStorefrontRankingSettings() {
  const hidden = { showLovedByDrBeauty: false, showDrBeautyElites: false };
  try {
    const supabase = await getSupabase();
    if (!supabase) return { data: hidden, error: true };
    const { data, error } = await supabase.from("storefront_ranking_settings")
      .select("show_loved_by_dr_beauty,show_dr_beauty_elites")
      .maybeSingle();
    if (error || !data) return { data: hidden, error: true };
    return {
      data: {
        showLovedByDrBeauty: data.show_loved_by_dr_beauty === true,
        showDrBeautyElites: data.show_dr_beauty_elites === true,
      },
      error: false,
    };
  } catch {
    return { data: hidden, error: true };
  }
}

export async function getPublicStorefrontCustomerRankings() {
  try {
    const supabase = await getSupabase();
    if (!supabase) return { data: null, error: true };
    const { data, error } = await supabase.rpc("get_public_storefront_customer_rankings");
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return { data: null, error: true };
    const normalizeRows = (rows, limit) => Array.isArray(rows)
      ? rows.slice(0, limit).flatMap((row) => typeof row?.display_name === "string"
        ? [{ displayName: row.display_name.slice(0, 160) }]
        : [])
      : [];
    return {
      data: {
        lovedByDrBeauty: normalizeRows(data.loved_by_dr_beauty, 5),
        drBeautyElites: normalizeRows(data.dr_beauty_elites, 3),
      },
      error: false,
    };
  } catch {
    return { data: null, error: true };
  }
}

export async function getCatalogCategories() {
  try {
    const supabase = await getSupabase();
    if (!supabase) return unavailableResult();

    const { data, error } = await supabase
      .from("categories")
      .select("id,slug,name,description,image_url,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) return unavailableResult();
    return { data: (data ?? []).map(mapCategory), error: null };
  } catch {
    return unavailableResult();
  }
}

export async function getCatalogBrands() {
  try {
    const supabase = await getSupabase();
    if (!supabase) return unavailableResult();

    const { data, error } = await supabase
      .from("brands")
      .select("id,slug,name")
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) return unavailableResult();
    return {
      data: (data ?? []).map((row) => ({ id: row.id, slug: row.slug, name: row.name })),
      error: null,
    };
  } catch {
    return unavailableResult();
  }
}

export async function getCatalogShopProducts(filters = {}) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return unavailableResult();

    const requestedPageSize = Number.isSafeInteger(filters.pageSize) ? filters.pageSize : DEFAULT_CATALOG_PAGE_SIZE;
    const pageSize = Math.min(Math.max(requestedPageSize, 1), MAX_CATALOG_PAGE_SIZE);
    const { data, error } = await supabase.rpc("get_public_shop_catalog", {
      p_query: typeof filters.query === "string" ? filters.query.slice(0, 160) : "",
      p_category_slug: filters.category && filters.category !== "all" ? filters.category : null,
      p_brand_slugs: Array.isArray(filters.brandSlugs) ? filters.brandSlugs.slice(0, 20) : [],
      p_sort: ["featured", "price-low", "price-high", "rating"].includes(filters.sort) ? filters.sort : "featured",
      p_rating_min: [3.5, 4, 4.5].includes(filters.ratingMin) ? filters.ratingMin : null,
      p_page: Number.isSafeInteger(filters.page) ? filters.page : 1,
      p_page_size: pageSize,
    });
    if (error) return unavailableResult();

    const catalog = Array.isArray(data) ? data[0] : data;
    if (!catalog || !Array.isArray(catalog.products)) return unavailableResult();
    const totalCount = Number(catalog.totalCount);
    const returnedPage = Number(catalog.page);
    const returnedPageSize = Number(catalog.pageSize);
    if (!Number.isSafeInteger(totalCount) || totalCount < 0 ||
        !Number.isSafeInteger(returnedPage) || returnedPage < 1 || returnedPage > MAX_CATALOG_PAGE ||
        !Number.isSafeInteger(returnedPageSize) || returnedPageSize < 1 || returnedPageSize > MAX_CATALOG_PAGE_SIZE ||
        catalog.products.length > returnedPageSize) return unavailableResult();

    const rows = catalog.products;
    const [availability, imageFocalPoints] = await Promise.all([
      loadProductAvailability(supabase, rows.map((row) => row.id)),
      loadImageFocalPoints(supabase, rows.map((row) => row.id)),
    ]);
    const products = rows.map((row) => ({
      ...mapProduct(row, availability?.get(row.id) ?? null, imageFocalPoints),
      rating: row.rating == null ? null : Number(row.rating),
      reviews: row.reviews == null ? null : Number(row.reviews),
    }));
    const pagination = catalogPaginationSummary({
      page: returnedPage,
      pageSize: returnedPageSize,
      totalCount,
      itemCount: products.length,
    });

    return {
      data: products,
      pagination,
      ratingsAvailable: catalog.ratingsAvailable === true,
      error: null,
    };
  } catch {
    return unavailableResult();
  }
}

export async function getCatalogProducts({ categoryId, featured = false, limit, includeSearchFields = false } = {}) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return unavailableResult();

    let query = supabase
      .from("products")
      .select(includeSearchFields ? productSearchSelection : productCardSelection)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (categoryId) query = query.eq("category_id", categoryId);
    if (featured) query = query.eq("is_bestseller", true);
    if (limit) query = query.limit(limit);

    const { data, error } = await query;
    if (error) return unavailableResult();
    const rows = data ?? [];
    const [reviewResult, availability] = await Promise.all([
      loadApprovedReviewStats(supabase, rows.map((row) => row.id)),
      loadProductAvailability(supabase, rows.map((row) => row.id)),
    ]);
    const products = rows.map((row) => {
      const product = mapProduct(row, availability?.get(row.id) ?? null);
      return reviewResult.error ? product : withReviewStats(product, reviewResult.stats);
    });
    return { data: products, error: null };
  } catch {
    return unavailableResult();
  }
}

export async function getCatalogProductBySlug(slug) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return unavailableResult();

    const { data, error } = await supabase
      .from("products")
      .select(productSearchSelection)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) return unavailableResult();
    if (!data) return { data: null, error: null };

    const [reviewStats, approvedReviews, availability] = await Promise.all([
      loadApprovedReviewStats(supabase, [data.id]),
      loadLatestApprovedReviews(supabase, data.id),
      loadProductAvailability(supabase, [data.id]),
    ]);
    const product = mapProduct(data, availability?.get(data.id) ?? null);
    const withStats = reviewStats.error ? product : withReviewStats(product, reviewStats.stats);
    return {
      data: {
        ...withStats,
        approvedReviews: approvedReviews.data ?? [],
        approvedReviewsAvailable: !approvedReviews.error,
      },
      error: null,
    };
  } catch {
    return unavailableResult();
  }
}

export async function getCatalogCategoryBySlug(slug) {
  try {
    const supabase = await getSupabase();
    if (!supabase) return unavailableResult();

    const { data, error } = await supabase
      .from("categories")
      .select("id,slug,name,description,image_url,sort_order")
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();

    if (error) return unavailableResult();
    return { data: data ? mapCategory(data) : null, error: null };
  } catch {
    return unavailableResult();
  }
}

export async function getFeaturedPromotions() {
  try {
    const supabase = await getSupabase();
    if (!supabase) return { data: [], error: true };
    const { data, error } = await supabase.rpc("get_public_featured_promotions", { p_limit: 12 });
    if (error || !Array.isArray(data)) return { data: [], error: true };
    return {
      data: data.filter((promotion) => promotion.title && promotion.code &&
        ["percentage", "fixed_amount"].includes(promotion.discount_type) &&
        Number.isFinite(Number(promotion.discount_value)) && Number(promotion.discount_value) > 0 &&
        Number.isFinite(Number(promotion.minimum_subtotal)) && Number(promotion.minimum_subtotal) >= 0),
      error: false,
    };
  } catch {
    return { data: [], error: true };
  }
}

export async function getCustomerOffers() {
  try {
    const supabase = await getSupabase();
    if (!supabase) return { data: null, error: true };
    const [promotionResult, shippingResult] = await Promise.all([
      supabase.rpc("get_public_featured_promotions", { p_limit: 24 }),
      supabase.from("shipping_settings")
        .select("is_shipping_enabled,free_shipping_minimum_subtotal")
        .eq("id", true)
        .maybeSingle(),
    ]);
    if (promotionResult.error || !Array.isArray(promotionResult.data)) return { data: null, error: true };
    return {
      data: {
        discountCodes: promotionResult.data.filter((promotion) => promotion.title && promotion.code &&
          ["percentage", "fixed_amount"].includes(promotion.discount_type) &&
          Number.isFinite(Number(promotion.discount_value)) && Number(promotion.discount_value) > 0 &&
          Number.isFinite(Number(promotion.minimum_subtotal)) && Number(promotion.minimum_subtotal) >= 0),
        freeShipping: shippingResult.error || !shippingResult.data?.is_shipping_enabled || shippingResult.data.free_shipping_minimum_subtotal == null
          ? null
          : { minimumSubtotal: Number(shippingResult.data.free_shipping_minimum_subtotal) },
        shippingError: Boolean(shippingResult.error),
      },
      error: false,
    };
  } catch {
    return { data: null, error: true };
  }
}

export async function getPublicDiscountAnnouncements() {
  try {
    const supabase = await getSupabase();
    if (!supabase) return { data: [], error: true };
    const { data, error } = await supabase.rpc("get_public_discount_announcements");
    if (error || !Array.isArray(data)) return { data: [], error: true };
    return {
      data: data.filter((row) => typeof row?.code === "string" &&
        ["percentage", "fixed_amount"].includes(row.discount_type) &&
        Number.isFinite(Number(row.discount_value)) && Number(row.discount_value) > 0 &&
        Number.isFinite(Number(row.minimum_subtotal)) && Number(row.minimum_subtotal) >= 0),
      error: false,
    };
  } catch {
    return { data: [], error: true };
  }
}
