const ORDER_STATUSES = new Set([
  "pending_confirmation",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
]);

const REQUIRED_TRANSITIONS = {
  confirmed: new Set(["pending_confirmation"]),
  processing: new Set(["confirmed"]),
  shipped: new Set(["processing"]),
  delivered: new Set(["shipped"]),
  cancelled: new Set(["pending_confirmation", "confirmed", "processing"]),
};

const REPEATED_FIELDS = [
  "delivery_id",
  "channel",
  "delivery_type",
  "recipient_email",
  "idempotency_key",
  "notification_status",
  "notification_event_at",
  "event_from_status",
  "order_number",
  "customer_name",
  "order_created_at",
  "current_order_status",
  "currency",
  "subtotal",
  "shipping_amount",
  "discount_amount",
  "total_amount",
  "shipping_carrier",
  "tracking_number",
  "tracking_url",
];

function failSnapshot() {
  throw new Error("The email snapshot is invalid.");
}

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isDecimal(value) {
  return (typeof value === "number" || typeof value === "string")
    && /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(String(value));
}

export function validateClaim(claim) {
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return false;
  return isUuid(claim.delivery_id)
    && isUuid(claim.claim_token)
    && isUuid(claim.order_id)
    && claim.channel === "email"
    && ["order_confirmation", "order_update"].includes(claim.delivery_type)
    && typeof claim.recipient_email === "string"
    && claim.recipient_email.length >= 3
    && claim.recipient_email.length <= 320
    && !/[\r\n\s]/.test(claim.recipient_email)
    && claim.recipient_phone === null
    && typeof claim.idempotency_key === "string"
    && claim.idempotency_key.length >= 1
    && claim.idempotency_key.length <= 200
    && (claim.order_status === null || ORDER_STATUSES.has(claim.order_status))
    && claim.status_payload !== null
    && typeof claim.status_payload === "object"
    && !Array.isArray(claim.status_payload)
    && Number.isInteger(claim.attempt_count)
    && claim.attempt_count >= 1
    && claim.attempt_count <= 5
    && isTimestamp(claim.lease_expires_at)
    && Date.parse(claim.lease_expires_at) > Date.now();
}

function validOrderNumber(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  }
  return typeof value === "string" && /^[1-9]\d{0,17}$/.test(value) ? value : null;
}

function validTrackingUrl(value) {
  if (value === null) return true;
  if (typeof value !== "string" || value !== value.trim()) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export function validateSnapshot(rows, claim) {
  if (!Array.isArray(rows) || rows.length < 1 || !claim || !validateClaim(claim)) {
    failSnapshot();
  }

  const snapshot = rows[0];
  if (
    !snapshot
    || typeof snapshot !== "object"
    || snapshot.delivery_id !== claim.delivery_id
  ) failSnapshot();

  const orderNumber = validOrderNumber(snapshot.order_number);
  if (
    snapshot.channel !== "email"
    || snapshot.delivery_type !== claim.delivery_type
    || snapshot.recipient_email !== claim.recipient_email
    || snapshot.idempotency_key !== claim.idempotency_key
    || snapshot.notification_status !== claim.order_status
    || !orderNumber
    || typeof snapshot.customer_name !== "string"
    || snapshot.customer_name.trim() === ""
    || !isTimestamp(snapshot.order_created_at)
    || !isTimestamp(snapshot.notification_event_at)
    || !ORDER_STATUSES.has(snapshot.current_order_status)
    || snapshot.currency !== "EGP"
    || ![snapshot.subtotal, snapshot.shipping_amount, snapshot.discount_amount, snapshot.total_amount]
      .every(isDecimal)
  ) {
    failSnapshot();
  }

  if (claim.delivery_type === "order_confirmation") {
    if (
      snapshot.notification_status !== null
      || snapshot.event_from_status !== null
      || snapshot.shipping_carrier !== null
      || snapshot.tracking_number !== null
      || snapshot.tracking_url !== null
    ) failSnapshot();
  } else if (
    !REQUIRED_TRANSITIONS[snapshot.notification_status]?.has(snapshot.event_from_status)
    || (snapshot.notification_status === "shipped"
      && (typeof snapshot.tracking_number !== "string"
        || snapshot.tracking_number.trim() === ""
        || !validTrackingUrl(snapshot.tracking_url)))
    || (snapshot.notification_status !== "shipped"
      && (snapshot.shipping_carrier !== null
        || snapshot.tracking_number !== null
        || snapshot.tracking_url !== null))
  ) {
    failSnapshot();
  }

  const repeatedValues = JSON.stringify(REPEATED_FIELDS.map((field) => snapshot[field]));
  const itemIds = new Set();
  for (const item of rows) {
    if (
      !item
      || JSON.stringify(REPEATED_FIELDS.map((field) => item[field])) !== repeatedValues
      || !isUuid(item.item_id)
      || itemIds.has(item.item_id)
      || typeof item.product_name_snapshot !== "string"
      || item.product_name_snapshot.trim() === ""
      || typeof item.product_slug_snapshot !== "string"
      || item.product_slug_snapshot.trim() === ""
      || !Number.isInteger(item.quantity)
      || item.quantity < 1
      || item.quantity > 999
      || !isDecimal(item.unit_price)
      || !isDecimal(item.line_total)
    ) failSnapshot();
    itemIds.add(item.item_id);
  }

  return { ...snapshot, order_number: orderNumber, items: rows };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function formatEgp(value) {
  if (!isDecimal(value)) failSnapshot();
  const [whole, fraction = ""] = String(value).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `EGP ${grouped}.${fraction.padEnd(2, "0")}`;
}

function formatOrderDate(value) {
  if (!isTimestamp(value)) failSnapshot();
  return new Intl.DateTimeFormat("en-EG", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Africa/Cairo",
  }).format(new Date(value));
}

function getCopy(snapshot) {
  if (snapshot.delivery_type === "order_confirmation") {
    return {
      subject: `We received your Dr. Beauty order #${snapshot.order_number}`,
      heading: "Thank you for your order",
      message: "Your order was received successfully. Keep your order number for reference.",
    };
  }

  const statusCopy = {
    confirmed: ["Your order is confirmed", "Your order has been confirmed."],
    processing: ["Your order is being prepared", "Your order is now being prepared."],
    shipped: ["Your order has shipped", "Your order is on its way."],
    delivered: ["Your order has been delivered", "Your order is marked as delivered."],
    cancelled: ["Your order was cancelled", "Your order has been cancelled."],
  };
  const copy = statusCopy[snapshot.notification_status];
  if (!copy) failSnapshot();
  return {
    subject: `${copy[0]} — Dr. Beauty order #${snapshot.order_number}`,
    heading: copy[0],
    message: copy[1],
  };
}

export function renderOrderEmail(snapshot) {
  const copy = getCopy(snapshot);
  const rowsHtml = snapshot.items.map((item) => (
    `<li>${escapeHtml(item.product_name_snapshot)} × ${item.quantity}`
      + ` — ${formatEgp(item.line_total)}</li>`
  )).join("");
  const rowsText = snapshot.items.map((item) => (
    `• ${item.product_name_snapshot} × ${item.quantity} — ${formatEgp(item.line_total)}`
  )).join("\n");

  const detailedRowsHtml = snapshot.items.map((item) => (
    `<li>${escapeHtml(item.product_name_snapshot)} x ${item.quantity} · ${formatEgp(item.unit_price)} each · item subtotal ${formatEgp(item.line_total)}</li>`
  )).join("");
  const detailedRowsText = snapshot.items.map((item) => (
    `- ${item.product_name_snapshot} x ${item.quantity} · ${formatEgp(item.unit_price)} each · item subtotal ${formatEgp(item.line_total)}`
  )).join("\n");

  let shipmentHtml = "";
  let shipmentText = "";
  if (snapshot.notification_status === "shipped") {
    const carrier = snapshot.shipping_carrier
      ? ` with ${escapeHtml(snapshot.shipping_carrier)}`
      : "";
    shipmentHtml = `<p>Tracking${carrier}: ${escapeHtml(snapshot.tracking_number)}</p>`;
    shipmentText = `Tracking${snapshot.shipping_carrier ? ` with ${snapshot.shipping_carrier}` : ""}: ${snapshot.tracking_number}`;
    if (snapshot.tracking_url) {
      shipmentHtml += `<p><a href="${escapeHtml(snapshot.tracking_url)}">View shipment tracking</a></p>`;
      shipmentText += `\nTracking link: ${snapshot.tracking_url}`;
    }
  }

  const total = formatEgp(snapshot.total_amount);
  const orderDate = formatOrderDate(snapshot.order_created_at);
  const financialDetailsHtml = `<dl><dt>Items subtotal</dt><dd>${formatEgp(snapshot.subtotal)}</dd><dt>Promotion discount</dt><dd>${formatEgp(snapshot.discount_amount)}</dd><dt>Delivery charge</dt><dd>${formatEgp(snapshot.shipping_amount)}</dd><dt>Total due on delivery</dt><dd><strong>${total}</strong></dd></dl>`;
  const financialDetailsText = `Items subtotal: ${formatEgp(snapshot.subtotal)}\nPromotion discount: ${formatEgp(snapshot.discount_amount)}\nDelivery charge: ${formatEgp(snapshot.shipping_amount)}\nTotal due on delivery: ${total}`;
  const safeName = escapeHtml(snapshot.customer_name);
  const html = `<main><p>Hello ${safeName},</p><h1>${escapeHtml(copy.heading)}</h1>`
    + `<p>${escapeHtml(copy.message)}</p><p>Order #${snapshot.order_number} · Placed ${escapeHtml(orderDate)} (Cairo time)</p>`
    + `<ul>${detailedRowsHtml}</ul>${shipmentHtml}${financialDetailsHtml}`
    + (snapshot.delivery_type === "order_confirmation" ? `<p>Payment: Cash on delivery. Amount is due upon delivery; this email does not mean payment has been collected.</p><p>Estimated delivery: 5–7 days. Timing may vary with order volume, carrier availability, and delivery location.</p>` : "")
    + `<p>This email is an order confirmation/summary, not a tax invoice or a substitute for a legally required receipt.</p></main>`;
  const text = `Hello ${snapshot.customer_name},\n\n${copy.heading}\n${copy.message}`
    + `\nOrder #${snapshot.order_number}\nPlaced ${orderDate} (Cairo time)\n\n${detailedRowsText}\n\n${shipmentText}`
    + `\n${financialDetailsText}`
    + (snapshot.delivery_type === "order_confirmation" ? "\nPayment: Cash on delivery. Amount is due upon delivery; this email does not mean payment has been collected.\nEstimated delivery: 5–7 days; timing may vary with order volume, carrier availability, and delivery location." : "")
    + "\nThis email is an order confirmation/summary, not a tax invoice or a substitute for a legally required receipt.";

  return { subject: copy.subject, html, text };
}
