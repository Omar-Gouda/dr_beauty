const CAIRO = "Africa/Cairo";

function getDateParts(value, timeZone = CAIRO) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map(({ type, value: partValue }) => [type, Number(partValue)]));
}

function localMidnightUtc(year, month, day, timeZone = CAIRO) {
  const target = Date.UTC(year, month - 1, day);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = getDateParts(guess, timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    guess += target - represented;
  }
  return new Date(guess);
}

export function getCairoVisitorPeriod(nowValue = new Date()) {
  const now = new Date(nowValue);
  if (!Number.isFinite(now.getTime())) throw new TypeError("A valid date is required.");
  const parts = getDateParts(now);
  const todayStart = localMidnightUtc(parts.year, parts.month, parts.day);
  const monthStart = localMidnightUtc(parts.year, parts.month, 1);
  return {
    today: parts,
    todayStart: todayStart.toISOString(),
    monthStart: monthStart.toISOString(),
    monthKey: `${parts.year}-${String(parts.month).padStart(2, "0")}-01`,
    timeZone: CAIRO,
  };
}

export function normalizeUserAnalytics(data, { visitorTrackingReady = true } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const count = (value) => value != null && value !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  const ranking = (value, limit) => Array.isArray(value)
    ? value.slice(0, limit).map((row, index) => ({
      rank: index + 1,
      displayName: typeof row.display_name === "string" && row.display_name.trim() ? row.display_name : "Private member",
      count: count(row.qualifying_orders),
      value: row.purchase_value != null && Number.isFinite(Number(row.purchase_value)) ? Number(row.purchase_value) : null,
    }))
    : null;
  return {
    totalUsers: count(data.total_users),
    newUsers: count(data.new_users_7d),
    visitorsToday: visitorTrackingReady ? count(data.visitors_today) : null,
    visitorsMtd: visitorTrackingReady ? count(data.visitors_mtd) : null,
    topBuyers: ranking(data.top_buyers, 5),
    elites: ranking(data.elites, 3),
    monthlyVisitorHistory: Array.isArray(data.monthly_visitor_history)
      ? data.monthly_visitor_history.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.month_start)).slice(0, 24)
      : [],
    trackingUnavailableReason: visitorTrackingReady ? null : "First-party visitor tracking is not configured on this server.",
    historyNote: "Order rankings include retained delivered orders available at tracking rollout; older orders removed by the 45-day retention policy cannot be reconstructed.",
  };
}
