export const DEFAULT_CATALOG_PAGE_SIZE = 24;
export const MAX_CATALOG_PAGE_SIZE = 48;
export const MAX_CATALOG_PAGE = 1000;
export const MAX_CATALOG_BRAND_FILTERS = 20;

const SORT_OPTIONS = new Set(["featured", "price-low", "price-high", "rating"]);
const RATING_OPTIONS = new Set(["3.5", "4", "4.5"]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function singleString(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === "string") return value[0];
  return "";
}

function positiveInteger(value, fallback, maximum) {
  const raw = singleString(value);
  if (!/^\d+$/.test(raw)) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

export function normalizeCatalogPageRequest(searchParams = {}, { categories = [], brands = [] } = {}) {
  const validCategorySlugs = new Set(categories.map((category) => category.slug));
  const validBrandSlugs = new Set(brands.map((brand) => brand.slug));
  const rawQuery = singleString(searchParams.q)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 160);
  const rawCategory = singleString(searchParams.category).trim().toLowerCase();
  const rawSort = singleString(searchParams.sort);
  const rawRating = singleString(searchParams.rating);
  const rawBrands = Array.isArray(searchParams.brand)
    ? searchParams.brand
    : typeof searchParams.brand === "string" ? [searchParams.brand] : [];
  const selectedBrands = [...new Set(rawBrands
    .filter((brand) => typeof brand === "string" && SLUG_PATTERN.test(brand))
    .map((brand) => brand.toLowerCase())
    .filter((brand) => validBrandSlugs.has(brand)))].slice(0, MAX_CATALOG_BRAND_FILTERS);

  return {
    query: rawQuery,
    category: SLUG_PATTERN.test(rawCategory) && validCategorySlugs.has(rawCategory) ? rawCategory : "all",
    brandSlugs: selectedBrands,
    sort: SORT_OPTIONS.has(rawSort) ? rawSort : "featured",
    ratingMin: RATING_OPTIONS.has(rawRating) ? Number(rawRating) : null,
    page: positiveInteger(searchParams.page, 1, MAX_CATALOG_PAGE),
    pageSize: positiveInteger(searchParams.pageSize, DEFAULT_CATALOG_PAGE_SIZE, MAX_CATALOG_PAGE_SIZE),
  };
}

export function catalogPaginationSummary({ page = 1, pageSize = DEFAULT_CATALOG_PAGE_SIZE, totalCount = 0, itemCount = 0 } = {}) {
  const totalPages = totalCount > 0 ? Math.min(Math.ceil(totalCount / pageSize), MAX_CATALOG_PAGE) : 0;
  const requestedPage = Number.isSafeInteger(page) ? Math.max(page, 1) : 1;
  const currentPage = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const firstItem = totalCount === 0 || itemCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  return {
    page: currentPage,
    pageSize,
    totalCount,
    totalPages,
    firstItem,
    lastItem: firstItem === 0 ? 0 : firstItem + itemCount - 1,
    hasPrevious: currentPage > 1,
    hasNext: currentPage < totalPages,
  };
}

