export const ADMIN_ORDER_STATUSES = Object.freeze([
  "pending_confirmation",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

export const ADMIN_ORDER_PAGE_SIZES = Object.freeze([10, 25, 50]);
export const DEFAULT_ADMIN_ORDER_PAGE_SIZE = 25;
const MAX_ADMIN_ORDER_PAGE = 100_000;

function singleString(value) {
  return typeof value === "string" ? value : "";
}

export function normalizeAdminOrderFilters(input = {}) {
  const rawSearch = singleString(input.q).trim();
  const search = rawSearch.replace(/[^\p{L}\p{N}\s+-]/gu, "").replace(/\s+/g, " ").slice(0, 80).trim();
  const requestedStatus = singleString(input.status);
  const status = requestedStatus === "all" || !ADMIN_ORDER_STATUSES.includes(requestedStatus)
    ? "all"
    : requestedStatus;
  const rawPage = singleString(input.page);
  const parsedPage = /^\d{1,9}$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(parsedPage) && parsedPage > 0
    ? Math.min(parsedPage, MAX_ADMIN_ORDER_PAGE)
    : 1;
  const rawPageSize = Number(singleString(input.pageSize));
  const pageSize = ADMIN_ORDER_PAGE_SIZES.includes(rawPageSize)
    ? rawPageSize
    : DEFAULT_ADMIN_ORDER_PAGE_SIZE;
  return { search, status, page, pageSize };
}

export function buildAdminOrderSearchExpression(search) {
  const normalized = typeof search === "string" ? search.trim() : "";
  if (!normalized) return null;

  const clauses = [];
  const digits = normalized.replace(/\s+/g, "");
  if (/^\d{1,19}$/.test(digits)) {
    try {
      if (BigInt(digits) <= 9223372036854775807n) clauses.push(`order_number.eq.${digits}`);
    } catch {
      // Invalid numeric input is still searched against the customer fields.
    }
  }
  clauses.push(`customer_name.ilike.*${normalized}*`);
  clauses.push(`customer_phone.ilike.*${normalized}*`);
  return clauses.join(",");
}

export function getAdminOrderPageCount(totalCount, pageSize) {
  return Math.max(1, Math.ceil(Math.max(0, Number(totalCount) || 0) / pageSize));
}

export function buildAdminOrdersPageHref(filters, page) {
  const params = new URLSearchParams();
  if (filters.search) params.set("q", filters.search);
  if (filters.status !== "all") params.set("status", filters.status);
  if (filters.pageSize !== DEFAULT_ADMIN_ORDER_PAGE_SIZE) params.set("pageSize", String(filters.pageSize));
  params.set("page", String(page));
  return `/admin/orders?${params.toString()}`;
}
