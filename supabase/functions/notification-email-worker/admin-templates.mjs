const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isUuid(value) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isDecimal(value) {
  return (typeof value === "number" || typeof value === "string")
    && /^(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/.test(String(value));
}

export function validateAdminOrderEmailClaim(claim) {
  if (!claim || typeof claim !== "object" || Array.isArray(claim)) return false;
  const orderNumber = typeof claim.order_number === "number"
    ? Number.isSafeInteger(claim.order_number) && claim.order_number > 0
    : typeof claim.order_number === "string" && /^[1-9]\d{0,17}$/.test(claim.order_number);

  return isUuid(claim.delivery_id)
    && isUuid(claim.claim_token)
    && claim.notification_type === "admin_order_created"
    && typeof claim.recipient_email === "string"
    && claim.recipient_email.length <= 320
    && EMAIL_PATTERN.test(claim.recipient_email)
    && typeof claim.idempotency_key === "string"
    && /^admin-order-created:[0-9a-f-]{36}:[0-9a-f-]{36}$/i.test(claim.idempotency_key)
    && Number.isInteger(claim.attempt_count)
    && claim.attempt_count >= 1
    && claim.attempt_count <= 5
    && typeof claim.lease_expires_at === "string"
    && Number.isFinite(Date.parse(claim.lease_expires_at))
    && Date.parse(claim.lease_expires_at) > Date.now()
    && orderNumber
    && typeof claim.customer_name === "string"
    && claim.customer_name.trim().length > 0
    && claim.customer_name.length <= 240
    && typeof claim.order_created_at === "string"
    && Number.isFinite(Date.parse(claim.order_created_at))
    && isDecimal(claim.total_amount)
    && claim.currency === "EGP";
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

function formatAmount(value) {
  if (!isDecimal(value)) throw new Error("Invalid admin order amount.");
  const [whole, fraction = ""] = String(value).split(".");
  return `EGP ${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction.padEnd(2, "0")}`;
}

export function renderAdminOrderEmail(claim) {
  if (!validateAdminOrderEmailClaim(claim)) throw new Error("Invalid admin order email claim.");
  const safeName = escapeHtml(claim.customer_name);
  const total = formatAmount(claim.total_amount);
  const placedAt = new Date(claim.order_created_at).toLocaleString("en-EG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
  const subject = `New COD order #${claim.order_number} — Dr. Beauty`;
  const html = `<main><h1>New cash-on-delivery order</h1><p>Order #${claim.order_number}</p><p>Customer: ${safeName}</p><p>Placed: ${escapeHtml(placedAt)} UTC</p><p>Total: ${total}</p><p>Review this order in the Dr. Beauty admin dashboard.</p></main>`;
  const text = `New cash-on-delivery order\nOrder #${claim.order_number}\nCustomer: ${claim.customer_name}\nPlaced: ${placedAt} UTC\nTotal: ${total}\nReview this order in the Dr. Beauty admin dashboard.`;
  return { subject, html, text };
}

export async function processAdminOrderEmailClaim(claim, { deliver, complete, fail, log = () => {} }) {
  if (!validateAdminOrderEmailClaim(claim)) {
    const hasFence = isUuid(claim?.delivery_id) && isUuid(claim?.claim_token);
    if (!hasFence) {
      log("invalid_claim");
      return "deferred";
    }
    try {
      return await fail(claim, "invalid_message") ? "failed" : "deferred";
    } catch {
      return "deferred";
    }
  }

  let message;
  try {
    message = renderAdminOrderEmail(claim);
  } catch {
    try {
      return await fail(claim, "invalid_message") ? "failed" : "deferred";
    } catch {
      return "deferred";
    }
  }

  let result;
  try {
    result = await deliver({ ...message, to: claim.recipient_email }, {
      idempotencyKey: claim.idempotency_key,
    });
  } catch {
    result = { kind: "ambiguous" };
  }

  if (result?.kind === "ambiguous") {
    log("provider_outcome_ambiguous");
    return "deferred";
  }
  if (result?.kind === "retryable" || result?.kind === "rejected") {
    try {
      return await fail(claim, result.errorCode) ? "failed" : "deferred";
    } catch {
      return "deferred";
    }
  }
  if (result?.kind !== "accepted"
      || typeof result.providerMessageId !== "string"
      || result.providerMessageId.trim() === "") {
    log("provider_result_unconfirmed");
    return "deferred";
  }

  try {
    await complete(claim, result.providerMessageId);
    return "sent";
  } catch {
    log("completion_unconfirmed");
    return "deferred";
  }
}
