const MESSAGE_TEMPLATES = Object.freeze({
  "support.general": { category: "customer_support", purpose: "Start a general customer support conversation.", variables: [], text: "Hello Dr. Beauty, I would like help with a question." },
  "support.request": { category: "customer_support", purpose: "Prepare the customer's saved support request for manual review and sending.", variables: ["category", "question"], text: "Hello Dr. Beauty, I submitted a support request. Category: {{category}}. My question: {{question}}" },
  "account.access": { category: "customer_account", purpose: "Ask for registration or sign-in assistance.", variables: [], text: "Hello Dr. Beauty, I need help with account access." },
  "account.question": { category: "customer_account", purpose: "Ask a general account question.", variables: [], text: "Hello Dr. Beauty, I have a question about my account." },
  "order.existing": { category: "orders", purpose: "Ask about an existing order.", variables: ["orderReference"], text: "Hello Dr. Beauty, I have a question about order #{{orderReference}}." },
  "order.confirmation": { category: "orders", purpose: "Ask whether an order has been confirmed.", variables: ["orderReference"], text: "Hello Dr. Beauty, could you confirm whether order #{{orderReference}} has been confirmed?" },
  "order.placed": { category: "orders", purpose: "Continue after successfully placing a cash-on-delivery order.", variables: ["customerName", "orderReference", "orderItems", "orderStatus", "currency", "totalAmount"], text: "Hello Dr. Beauty, my name is {{customerName}}. I placed cash on delivery order #{{orderReference}}. Items and quantities: {{orderItems}}. Its current status is {{orderStatus}} and total is {{currency}} {{totalAmount}}. Please help confirm the order." },
  "order.gift_placed": { category: "orders", purpose: "Continue after placing a gift order and confirm its saved gift details.", variables: ["orderReference", "recipientName", "giftMessage", "giftPackaging"], text: "Hello Dr. Beauty, I placed gift order #{{orderReference}} for {{recipientName}}. Dedication: {{giftMessage}}. Gift packaging: {{giftPackaging}}. Please help confirm the order." },
  "order.status": { category: "orders", purpose: "Ask for clarification about an order status.", variables: ["orderReference"], text: "Hello Dr. Beauty, could you clarify the status of order #{{orderReference}}?" },
  "order.change": { category: "orders", purpose: "Ask whether an order can be changed.", variables: ["orderReference"], text: "Hello Dr. Beauty, can I request a change to order #{{orderReference}}?" },
  "order.cancel": { category: "orders", purpose: "Ask whether an order can be cancelled.", variables: ["orderReference"], text: "Hello Dr. Beauty, I would like to ask about cancelling order #{{orderReference}}." },
  "order.delivery": { category: "orders", purpose: "Report an order delivery issue.", variables: ["orderReference"], text: "Hello Dr. Beauty, I need help with delivery for order #{{orderReference}}." },
  "order.item_issue": { category: "orders", purpose: "Report a damaged or incorrect order item.", variables: ["orderReference"], text: "Hello Dr. Beauty, I need help with an item in order #{{orderReference}}." },
  "product.question": { category: "products", purpose: "Ask a question about a product.", variables: ["productName"], text: "Hello Dr. Beauty, I have a question about {{productName}}." },
  "consultation.beauty_tips": { category: "consultations", purpose: "Prepare a customer-selected beauty consultation question for review before sending.", variables: ["category", "productName", "question"], text: "Hello Dr. Beauty, I would like beauty guidance. Category: {{category}}. Product: {{productName}}. My question: {{question}}" },
  "product.availability": { category: "products", purpose: "Ask whether a product is available.", variables: ["productName"], text: "Hello Dr. Beauty, is {{productName}} currently available?" },
  "product.restock": { category: "products", purpose: "Ask when an out-of-stock product may return.", variables: ["productName"], text: "Hello Dr. Beauty, do you know when {{productName}} may be back in stock?" },
  "product.recommendation": { category: "products", purpose: "Request a product recommendation.", variables: ["productName"], text: "Hello Dr. Beauty, could you suggest products similar to {{productName}}?" },
  "wishlist.question": { category: "wishlist", purpose: "Ask about a saved wishlist product.", variables: ["productName"], text: "Hello Dr. Beauty, I have a question about {{productName}} from my wishlist." },
  "wishlist.back_in_stock": { category: "wishlist", purpose: "Ask whether a wishlist product is currently available.", variables: ["productName"], text: "Hello Dr. Beauty, I saw {{productName}} listed and would like to ask whether it is currently available." },
  "admin.order_contact": { category: "admin_communication", purpose: "Let an authorized administrator contact a customer about an order.", variables: ["orderReference"], text: "Hello, this is Dr. Beauty following up about your order #{{orderReference}}." },
  "admin.order_status": { category: "admin_communication", purpose: "Prepare an administrator's customer-facing order status update.", variables: ["orderReference", "orderStatus"], text: "Hello, this is Dr. Beauty with an update about order #{{orderReference}}. Its status is now {{orderStatus}}." },
  "admin.support_followup": { category: "admin_communication", purpose: "Let an authorized administrator follow up on a customer support request.", variables: [], text: "Hello, this is Dr. Beauty following up on your support request." },
});

const PHONE_PATTERN = /^[1-9]\d{7,14}$/;
const VARIABLE_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;

export class WhatsAppMessageError extends Error {
  constructor(code) {
    super(code);
    this.name = "WhatsAppMessageError";
    this.code = code;
  }
}

export function getWhatsAppTemplate(templateId) {
  if (!Object.hasOwn(MESSAGE_TEMPLATES, templateId)) return null;
  const template = MESSAGE_TEMPLATES[templateId];
  return Object.freeze({ ...template, variables: Object.freeze([...template.variables]) });
}

export function renderWhatsAppMessage(templateId, variables = {}) {
  const template = getWhatsAppTemplate(templateId);
  if (!template) throw new WhatsAppMessageError("unknown_template");
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw new WhatsAppMessageError("invalid_variables");
  }

  const allowed = new Set(template.variables);
  if (Object.keys(variables).some((key) => !allowed.has(key))) {
    throw new WhatsAppMessageError("unexpected_variable");
  }

  const message = template.text.replace(VARIABLE_PATTERN, (_match, key) => {
    const value = variables[key];
    if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
      throw new WhatsAppMessageError("missing_variable");
    }
    return String(value).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  });

  if (/{{|}}|\b(?:undefined|null)\b/i.test(message)) {
    throw new WhatsAppMessageError("unresolved_template");
  }
  return message;
}

export function buildWhatsAppClickToChatUrl(destination, templateId, variables = {}) {
  if (typeof destination !== "string" || !PHONE_PATTERN.test(destination)) {
    throw new WhatsAppMessageError("invalid_destination");
  }
  return `https://wa.me/${destination}?text=${encodeURIComponent(renderWhatsAppMessage(templateId, variables))}`;
}

export function normalizeWhatsAppPhoneNumber(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  const asciiDigits = value.replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
  const compact = asciiDigits.trim().replace(/[\s().-]/g, "");
  let international;
  if (/^00\d+$/.test(compact)) international = compact.slice(2);
  else if (/^\+\d+$/.test(compact)) international = compact.slice(1);
  else if (/^0\d+$/.test(compact)) international = `20${compact.slice(1)}`;
  else if (/^20\d+$/.test(compact)) international = compact;
  else return null;

  return PHONE_PATTERN.test(international) ? international : null;
}

export function buildDiscountCommunityMessage(promotion) {
  if (!promotion || typeof promotion !== "object" ||
      typeof promotion.code !== "string" || !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(promotion.code) ||
      !["percentage", "fixed_amount"].includes(promotion.discount_type) ||
      !Number.isFinite(Number(promotion.discount_value)) || Number(promotion.discount_value) <= 0) {
    throw new WhatsAppMessageError("invalid_discount");
  }

  const amount = promotion.discount_type === "percentage"
    ? `${Number(promotion.discount_value)}% off`
    : `EGP ${Number(promotion.discount_value).toFixed(2)} off`;
  const lines = [
    typeof promotion.title === "string" && promotion.title.trim() ? promotion.title.trim() : "Dr. Beauty discount",
    `Discount: ${amount}`,
    `Code: ${promotion.code}`,
  ];
  if (typeof promotion.description === "string" && promotion.description.trim()) lines.push(promotion.description.trim());
  if (Number(promotion.minimum_subtotal) > 0) lines.push(`Minimum subtotal: EGP ${Number(promotion.minimum_subtotal).toFixed(2)}`);
  if (Number(promotion.maximum_discount) > 0) lines.push(`Maximum discount: EGP ${Number(promotion.maximum_discount).toFixed(2)}`);
  if (Number.isSafeInteger(promotion.maximum_redemptions) && promotion.maximum_redemptions > 0) lines.push(`Limited to ${promotion.maximum_redemptions} redemptions`);
  for (const [label, value] of [["Starts", promotion.starts_at], ["Expires", promotion.ends_at]]) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new WhatsAppMessageError("invalid_discount_date");
    lines.push(`${label}: ${date.toISOString().slice(0, 10)} UTC`);
  }
  if (typeof promotion.target_path === "string" && promotion.target_path.startsWith("/")) lines.push(`Shop: ${promotion.target_path}`);
  lines.push("Enter this code at checkout. Availability and eligibility are checked when ordering.");
  return lines.join("\n");
}

export function buildCodOrderConfirmationUrl(destination, confirmation) {
  const orderReference = typeof confirmation?.orderNumber === "number"
    ? String(confirmation.orderNumber)
    : confirmation?.orderNumber;
  const totalAmount = typeof confirmation?.totalAmount === "number" || typeof confirmation?.totalAmount === "string"
    ? String(confirmation.totalAmount)
    : "";
  const validStatus = ["pending_confirmation", "confirmed", "processing", "shipped", "delivered", "cancelled"]
    .includes(confirmation?.status);
  const validCustomerName = typeof confirmation?.customerName === "string" &&
    confirmation.customerName.trim().length > 0 && confirmation.customerName.length <= 160;
  const validItems = Array.isArray(confirmation?.items) && confirmation.items.length > 0 && confirmation.items.length <= 50 &&
    confirmation.items.every((item) => typeof item?.name === "string" && item.name.trim().length > 0 &&
      item.name.length <= 240 && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 999);
  if (typeof orderReference !== "string" || !/^\d{1,18}$/.test(orderReference) ||
      !/^\d{1,12}(?:\.\d{1,2})?$/.test(totalAmount) || confirmation?.currency !== "EGP" || !validStatus ||
      !validCustomerName || !validItems) {
    throw new WhatsAppMessageError("invalid_order_confirmation");
  }

  if (confirmation?.isGift) {
    const recipientName = confirmation.giftRecipientName;
    if (typeof recipientName !== "string" || !recipientName.trim() || recipientName.length > 160 ||
        typeof confirmation.giftPackagingSelected !== "boolean") {
      throw new WhatsAppMessageError("invalid_order_confirmation");
    }
    const giftMessage = typeof confirmation.giftMessage === "string" && confirmation.giftMessage.trim()
      ? confirmation.giftMessage.trim()
      : "No dedication included";
    const packagingAmount = Number(confirmation.giftPackagingFeeAmount);
    if (!Number.isFinite(packagingAmount) || packagingAmount < 0 ||
        (confirmation.giftPackagingSelected && packagingAmount <= 0) ||
        (!confirmation.giftPackagingSelected && packagingAmount !== 0)) {
      throw new WhatsAppMessageError("invalid_order_confirmation");
    }
    const giftPackaging = confirmation.giftPackagingSelected
      ? `Included (EGP ${packagingAmount.toFixed(2)})`
      : "Not requested";
    return buildWhatsAppClickToChatUrl(destination, "order.gift_placed", {
      orderReference,
      recipientName: recipientName.trim(),
      giftMessage,
      giftPackaging,
    });
  }

  return buildWhatsAppClickToChatUrl(destination, "order.placed", {
    customerName: confirmation.customerName.trim(),
    orderReference,
    orderItems: confirmation.items.map((item) => `${item.name.trim()} x ${item.quantity}`).join("; "),
    orderStatus: confirmation.status.replaceAll("_", " "),
    currency: confirmation.currency,
    totalAmount,
  });
}

export function getWhatsAppSupportDestination() {
  const configuredDestination = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER;
  const destination = typeof configuredDestination === "string" ? configuredDestination.trim() : "";
  return PHONE_PATTERN.test(destination) ? destination : null;
}

