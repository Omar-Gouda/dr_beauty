const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_DAYS = new Set([7, 30, 90]);

export function normalizeCairoRevenueMetrics(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const count = (value) => value != null && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const amount = (value) => value != null && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const result = {
    totalOrders: count(data.total_orders),
    todayOrders: count(data.today_orders),
    mtdOrders: count(data.mtd_orders),
    todayDeliveredValue: amount(data.today_delivered_value),
    mtdDeliveredValue: amount(data.mtd_delivered_value),
    todayCollectedRevenue: amount(data.today_collected_revenue),
    mtdCollectedRevenue: amount(data.mtd_collected_revenue),
    todayDiscountUses: count(data.today_discount_uses),
    mtdDiscountUses: count(data.mtd_discount_uses),
    todayDiscountAmount: amount(data.today_discount_amount),
    mtdDiscountAmount: amount(data.mtd_discount_amount),
  };
  return Object.values(result).some((value) => value === null) ? null : result;
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function utcStartOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseDateOnly(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = validDate(`${value}T00:00:00.000Z`);
  return date?.toISOString().slice(0, 10) === value ? date : null;
}

export function getAdminDashboardRange({ range = "last30", from, to } = {}, nowValue = new Date()) {
  const now = validDate(nowValue) ?? new Date();
  range = typeof range === "string" ? range : "last30";
  let start;
  let end = now;
  let previousStart;
  let previousEnd;
  let label;
  let error = null;

  if (range === "today") {
    start = utcStartOfDay(now);
    const elapsed = now.getTime() - start.getTime();
    previousStart = new Date(start.getTime() - DAY_MS);
    previousEnd = new Date(previousStart.getTime() + elapsed);
    label = "Today";
  } else if (RANGE_DAYS.has(Number(range.replace?.("last", "")))) {
    const days = Number(range.replace("last", ""));
    start = new Date(now.getTime() - days * DAY_MS);
    previousEnd = start;
    previousStart = new Date(start.getTime() - days * DAY_MS);
    label = `Last ${days} days`;
  } else if (range === "thisYear") {
    start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    previousStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
    previousEnd = new Date(previousStart.getTime() + (now.getTime() - start.getTime()));
    label = "This year";
  } else if (range === "custom") {
    const fromDate = parseDateOnly(from);
    const toDate = parseDateOnly(to);
    if (!fromDate || !toDate || fromDate > toDate || toDate > utcStartOfDay(now) || (toDate.getTime() - fromDate.getTime()) / DAY_MS > 730) {
      error = "Choose a valid date range of up to two years.";
      end = utcStartOfDay(now);
      start = new Date(end.getTime() - 30 * DAY_MS);
      previousEnd = start;
      previousStart = new Date(start.getTime() - 30 * DAY_MS);
      label = "Last 30 days";
    } else {
      start = fromDate;
      end = new Date(toDate.getTime() + DAY_MS);
      const duration = end.getTime() - start.getTime();
      previousEnd = start;
      previousStart = new Date(start.getTime() - duration);
      label = `${from} – ${to}`;
    }
  } else {
    range = "last30";
    start = new Date(now.getTime() - 30 * DAY_MS);
    previousEnd = start;
    previousStart = new Date(start.getTime() - 30 * DAY_MS);
    label = "Last 30 days";
  }

  const duration = end.getTime() - start.getTime();
  const days = Math.max(1, Math.ceil(duration / DAY_MS));
  const bucket = days <= 1 ? "hour" : days <= 45 ? "day" : days <= 120 ? "week" : "month";
  return {
    range,
    start: start.toISOString(),
    end: end.toISOString(),
    previousStart: previousStart.toISOString(),
    previousEnd: previousEnd.toISOString(),
    label,
    bucket,
    days,
    historyMayBeIncomplete: start.getTime() < now.getTime() - 45 * DAY_MS,
    error,
  };
}

function getBucketStart(date, bucket) {
  if (bucket === "hour") return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()));
  if (bucket === "day") return utcStartOfDay(date);
  if (bucket === "week") {
    const day = date.getUTCDay();
    const mondayOffset = day === 0 ? 6 : day - 1;
    return utcStartOfDay(new Date(date.getTime() - mondayOffset * DAY_MS));
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextBucket(date, bucket) {
  if (bucket === "hour") return new Date(date.getTime() + 60 * 60 * 1000);
  if (bucket === "day") return new Date(date.getTime() + DAY_MS);
  if (bucket === "week") return new Date(date.getTime() + 7 * DAY_MS);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function labelBucket(date, bucket) {
  const options = bucket === "hour"
    ? { hour: "numeric", timeZone: "UTC" }
    : bucket === "month"
      ? { month: "short", year: "numeric", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" };
  return new Intl.DateTimeFormat("en-EG", options).format(date);
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function buildAdminSalesSeries(orders, range) {
  const start = new Date(range.start);
  const end = new Date(range.end);
  const firstBucket = getBucketStart(start, range.bucket);
  const buckets = new Map();
  for (let cursor = firstBucket; cursor < end; cursor = nextBucket(cursor, range.bucket)) {
    buckets.set(cursor.toISOString(), { date: cursor.toISOString(), label: labelBucket(cursor, range.bucket), revenue: 0, orders: 0 });
  }

  for (const order of orders ?? []) {
    const createdAt = validDate(order.created_at);
    if (!createdAt || createdAt < start || createdAt >= end) continue;
    const key = getBucketStart(createdAt, range.bucket).toISOString();
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.orders += 1;
    if (order.order_status === "delivered" && order.payment_status !== "refunded") {
      bucket.revenue += toNumber(order.total_amount);
    }
  }
  return [...buckets.values()];
}

export function summarizeAdminOrders(orders) {
  const rows = Array.isArray(orders) ? orders : [];
  const delivered = rows.filter((order) => order.order_status === "delivered" && order.payment_status !== "refunded");
  const revenue = delivered.reduce((sum, order) => sum + toNumber(order.total_amount), 0);
  const collectedRevenue = delivered
    .filter((order) => order.payment_status === "paid")
    .reduce((sum, order) => sum + toNumber(order.total_amount), 0);
  const statuses = Object.fromEntries(["pending_confirmation", "confirmed", "processing", "shipped", "delivered", "cancelled"].map((status) => [
    status,
    rows.filter((order) => order.order_status === status).length,
  ]));
  const terminal = statuses.delivered + statuses.cancelled;
  return {
    revenue,
    collectedRevenue,
    averageOrderValue: delivered.length ? revenue / delivered.length : null,
    deliveredOrders: delivered.length,
    statuses,
    completionRate: terminal ? statuses.delivered / terminal * 100 : null,
    pendingCount: statuses.pending_confirmation,
    orderCount: rows.length,
  };
}

export function compareAdminMetric(current, previous) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

export function rankAdminProducts(items, limit = 5, sortBy = "quantity") {
  const products = new Map();
  for (const item of items ?? []) {
    const key = item.product_id ?? `${item.product_slug_snapshot}:${item.product_name_snapshot}`;
    const current = products.get(key) ?? {
      productId: item.product_id ?? null,
      name: item.product_name_snapshot || "Historical product",
      slug: item.product_slug_snapshot || "",
      quantity: 0,
      revenue: 0,
    };
    current.quantity += toNumber(item.quantity);
    current.revenue += Math.max(0, toNumber(item.line_total) - toNumber(item.promotion_discount_amount));
    products.set(key, current);
  }
  return [...products.values()]
    .toSorted((a, b) => sortBy === "revenue"
      ? b.revenue - a.revenue || b.quantity - a.quantity
      : b.quantity - a.quantity || b.revenue - a.revenue)
    .slice(0, limit);
}

