const PURPOSE = "Purpose:";
const ENGLISH_ONLY_FALLBACK = "Not provided in English";

const MESSAGE_TEMPLATES = {
  "support.general": { category: "customer_support", purpose: "Start a general customer support conversation.", variables: [], text: "Purpose: Contact Dr. Beauty customer support.\n\nSUPPORT REQUEST\nHello, I need help with a general question.\n\nPlease review this message and reply with the next steps." },
  "support.request": { category: "customer_support", purpose: "Prepare the customer's saved support request for manual review and sending.", variables: ["category", "question"], optionalVariables: ["orderReference", "productName"], text: "Purpose: Send a customer support request to Dr. Beauty.\n\nSUPPORT DETAILS\nCategory: {{category}}\nOrder number: {{orderReference}}\nProduct: {{productName}}\nRequest: {{question}}\n\nPlease review this request and reply with the next steps." },
  "account.access": { category: "customer_account", purpose: "Ask for registration or sign-in assistance.", variables: [], text: "Purpose: Request help accessing a Dr. Beauty account.\n\nACCOUNT SUPPORT\nHello, I need help creating an account or signing in.\n\nPlease review this message and reply with the next steps." },
  "account.question": { category: "customer_account", purpose: "Ask a general account question.", variables: [], text: "Purpose: Ask a question about a Dr. Beauty account.\n\nACCOUNT QUESTION\nHello, I have a question about my account.\n\nPlease review this message and reply with the next steps." },
  "order.existing": { category: "orders", purpose: "Ask about an existing order.", variables: ["orderReference"], optionalVariables: ["orderContext"], text: "Purpose: Ask about an existing Dr. Beauty order.\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderContext}}\n\nPlease review the details and reply with an update." },
  "order.confirmation": { category: "orders", purpose: "Ask whether an order has been confirmed.", variables: ["orderReference"], optionalVariables: ["orderContext"], text: "Purpose: Confirm that a Dr. Beauty order was received.\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderContext}}\n\nPlease confirm the order status." },
  "order.placed": { category: "orders", purpose: "Continue after successfully placing a cash-on-delivery order.", variables: ["customerName", "orderReference", "orderDetails"], text: "Purpose: Confirm and review a cash-on-delivery order with Dr. Beauty.\n\nCUSTOMER DETAILS\nName: {{customerName}}\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderDetails}}\n\nPlease review the details and confirm that they are correct." },
  "order.gift_placed": { category: "orders", purpose: "Continue after placing a gift order and confirm its saved gift details.", variables: ["customerName", "orderReference", "orderDetails", "recipientName", "giftMessage", "giftPackaging"], text: "Purpose: Confirm and review a gift order with Dr. Beauty.\n\nCUSTOMER DETAILS\nName: {{customerName}}\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderDetails}}\n\nGIFT DETAILS\nRecipient: {{recipientName}}\nGift message: {{giftMessage}}\nGift packaging: {{giftPackaging}}\n\nPlease review the details and confirm that they are correct." },
  "order.status": { category: "orders", purpose: "Ask for clarification about an order status.", variables: ["orderReference"], optionalVariables: ["orderContext"], text: "Purpose: Ask for a Dr. Beauty order status update.\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderContext}}\n\nPlease review the order and reply with its current status." },
  "order.change": { category: "orders", purpose: "Ask whether an order can be changed.", variables: ["orderReference"], optionalVariables: ["orderContext"], text: "Purpose: Ask whether a Dr. Beauty order can be changed.\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderContext}}\n\nPlease let me know whether a change is still possible." },
  "order.cancel": { category: "orders", purpose: "Ask whether an order can be cancelled.", variables: ["orderReference"], optionalVariables: ["orderContext"], text: "Purpose: Ask to cancel a Dr. Beauty order.\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderContext}}\n\nPlease review this cancellation request and reply with the next steps." },
  "order.delivery": { category: "orders", purpose: "Report an order delivery issue.", variables: ["orderReference"], optionalVariables: ["orderContext"], text: "Purpose: Report a delivery issue for a Dr. Beauty order.\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderContext}}\n\nDELIVERY ISSUE\nPlease review the delivery details and contact me with the next steps." },
  "order.item_issue": { category: "orders", purpose: "Report a damaged or incorrect order item.", variables: ["orderReference"], optionalVariables: ["orderContext", "productName", "issueCategory", "issueDescription", "requestedAction"], text: "Purpose: Report an issue with a Dr. Beauty order item.\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderContext}}\n\nITEM ISSUE\nProduct: {{productName}}\nIssue type: {{issueCategory}}\nDetails: {{issueDescription}}\nRequested next step: {{requestedAction}}\n\nPlease review the issue and reply with the next steps." },
  "product.question": { category: "products", purpose: "Ask a question about a product.", variables: ["productName"], text: "Purpose: Ask Dr. Beauty about a product.\n\nPRODUCT QUESTION\nProduct: {{productName}}\nQuestion: Please share more information about this product." },
  "consultation.beauty_tips": { category: "consultations", purpose: "Prepare a customer-selected beauty consultation question for review before sending.", variables: ["category", "productName", "question"], text: "Purpose: Ask Dr. Beauty a beauty and skincare consultation question.\n\nCONSULTATION DETAILS\nCategory: {{category}}\nProduct: {{productName}}\nQuestion: {{question}}\n\nPlease review this question and reply with general guidance." },
  "product.availability": { category: "products", purpose: "Ask whether a product is available.", variables: ["productName"], text: "Purpose: Check product availability with Dr. Beauty.\n\nPRODUCT\nName: {{productName}}\nQuestion: Is this product currently available?" },
  "product.restock": { category: "products", purpose: "Ask when an out-of-stock product may return.", variables: ["productName"], text: "Purpose: Ask when an out-of-stock product may return.\n\nPRODUCT\nName: {{productName}}\nQuestion: Is there an expected restock date?" },
  "product.recommendation": { category: "products", purpose: "Request a product recommendation.", variables: ["productName"], text: "Purpose: Request a product recommendation from Dr. Beauty.\n\nPRODUCT\nRelated to: {{productName}}\nRequest: Please recommend a similar product." },
  "wishlist.question": { category: "wishlist", purpose: "Ask about a saved wishlist product.", variables: ["productName"], text: "Purpose: Ask about a product saved to my Dr. Beauty wishlist.\n\nPRODUCT\nName: {{productName}}\nQuestion: I have a question about this saved product." },
  "wishlist.back_in_stock": { category: "wishlist", purpose: "Ask whether a wishlist product is currently available.", variables: ["productName"], text: "Purpose: Check availability of a product saved to my wishlist.\n\nPRODUCT\nName: {{productName}}\nQuestion: Is this product currently available?" },
  "admin.order_contact": { category: "admin_communication", purpose: "Let an authorized administrator contact a customer about an order.", variables: ["orderReference"], optionalVariables: ["orderContext"], text: "Purpose: Follow up with a customer about a Dr. Beauty order.\n\nORDER DETAILS\nOrder number: #{{orderReference}}\n{{orderContext}}\n\nPlease contact us if any details need correction." },
  "admin.order_status": { category: "admin_communication", purpose: "Prepare an administrator's customer-facing order status update.", variables: ["orderReference", "orderStatus"], optionalVariables: ["orderContext"], text: "Purpose: Share a Dr. Beauty order status update with the customer.\n\nORDER DETAILS\nOrder number: #{{orderReference}}\nCurrent status: {{orderStatus}}\n{{orderContext}}\n\nPlease contact us if you have a question about this update." },
  "admin.support_followup": { category: "admin_communication", purpose: "Let an authorized administrator follow up on a customer support request.", variables: [], text: "Purpose: Follow up on a customer support request sent to Dr. Beauty.\n\nSUPPORT FOLLOW-UP\nHello, we are following up on your support request. Please do not send passwords, authentication codes, or payment credentials." },
  "support.return_request": { category: "customer_support", purpose: "Prepare a return, exchange, or refund request for manual review and sending.", variables: ["category", "question", "requestedAction"], optionalVariables: ["orderReference", "productName"], text: "Purpose: Request review of a return, exchange, or refund by Dr. Beauty.\n\nREQUEST DETAILS\nRequest type: {{category}}\nOrder number: {{orderReference}}\nProduct: {{productName}}\nIssue details: {{question}}\nRequested next step: {{requestedAction}}\n\nPlease review this request and reply with the next steps." },
};
Object.freeze(MESSAGE_TEMPLATES);

const PHONE_PATTERN = /^[1-9]\d{7,14}$/;
const VARIABLE_PATTERN = /{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g;
const STATUS_LABELS = Object.freeze({
  pending_confirmation: "Pending confirmation",
  confirmed: "Confirmed",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
});
const PAYMENT_LABELS = Object.freeze({ pending: "Pending collection", paid: "Paid", failed: "Failed", refunded: "Refunded" });

export class WhatsAppMessageError extends Error {
  constructor(code) { super(code); this.name = "WhatsAppMessageError"; this.code = code; }
}

export function getWhatsAppTemplate(templateId) {
  if (!Object.hasOwn(MESSAGE_TEMPLATES, templateId)) return null;
  const template = MESSAGE_TEMPLATES[templateId];
  return Object.freeze({ ...template, variables: Object.freeze([...template.variables]), optionalVariables: Object.freeze([...(template.optionalVariables ?? [])]) });
}

function safeEnglish(value, fallback = ENGLISH_ONLY_FALLBACK) {
  if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) return fallback;
  const text = String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").trim();
  if (!/^[\x20-\x7e\n]+$/.test(text)) return fallback;
  return text.replace(/[\r\t ]+/g, " ").replace(/ *\n */g, "\n").trim();
}

function sanitizeVariable(value, key) {
  const multiline = ["orderContext", "orderDetails"].includes(key);
  const normalized = typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value;
  const result = safeEnglish(normalized, key === "question" || key === "issueDescription"
    ? "Please add the request details in English before sending."
    : key === "productName" ? "Product name is not available in English."
      : key === "orderContext" || key === "orderDetails" ? "Order details are not available in English."
        : ENGLISH_ONLY_FALLBACK);
  return multiline ? result.split("\n").map((line) => line.trim()).filter(Boolean).join("\n") : result.replace(/\s+/g, " ");
}

export function renderWhatsAppMessage(templateId, variables = {}) {
  const template = getWhatsAppTemplate(templateId);
  if (!template) throw new WhatsAppMessageError("unknown_template");
  if (!variables || typeof variables !== "object" || Array.isArray(variables)) throw new WhatsAppMessageError("invalid_variables");
  const allowed = new Set([...template.variables, ...template.optionalVariables]);
  if (Object.keys(variables).some((key) => !allowed.has(key))) throw new WhatsAppMessageError("unexpected_variable");
  const message = template.text.replace(VARIABLE_PATTERN, (_match, key) => {
    const value = variables[key];
    if (template.optionalVariables.includes(key) && (value === undefined || value === null || value === "")) return "";
    if ((typeof value !== "string" && typeof value !== "number") || !String(value).trim()) {
      if (template.optionalVariables.includes(key)) return "";
      throw new WhatsAppMessageError("missing_variable");
    }
    if (key === "orderStatus") return statusLabel(value);
    return sanitizeVariable(value, key);
  }).replace(/[ \t]+\n/g, "\n").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!message.startsWith(`${PURPOSE} `) || /{{|}}|\b(?:undefined|null)\b/i.test(message)) throw new WhatsAppMessageError("unresolved_template");
  return message;
}

export function buildWhatsAppClickToChatUrl(destination, templateId, variables = {}) {
  if (typeof destination !== "string" || !PHONE_PATTERN.test(destination)) throw new WhatsAppMessageError("invalid_destination");
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

function amount(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new WhatsAppMessageError("invalid_order_confirmation");
  return `${label}: EGP ${number.toFixed(2)}`;
}

function orderDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new WhatsAppMessageError("invalid_order_context");
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Cairo" }).format(date);
}

function orderStatus(status) {
  if (!Object.hasOwn(STATUS_LABELS, status)) throw new WhatsAppMessageError("invalid_order_confirmation");
  return STATUS_LABELS[status];
}

function statusLabel(status) {
  if (Object.hasOwn(STATUS_LABELS, status)) return STATUS_LABELS[status];
  if (typeof status !== "string") return ENGLISH_ONLY_FALLBACK;
  const label = safeEnglish(status, ENGLISH_ONLY_FALLBACK).replace(/[_-]+/g, " ");
  return label.replace(/\b\w/g, (character) => character.toUpperCase());
}

export function buildWhatsAppOrderContext(order) {
  if (!order || typeof order !== "object") throw new WhatsAppMessageError("invalid_order_context");
  const sections = [];
  const orderLines = [];
  if (order.created_at) orderLines.push(`Order date: ${orderDate(order.created_at)}`);
  if (order.order_status) orderLines.push(`Order status: ${orderStatus(order.order_status)}`);
  if (orderLines.length) sections.push(`ORDER DATE AND STATUS\n${orderLines.join("\n")}`);

  if (Array.isArray(order.items) && order.items.length) {
    if (order.items.length > 50) throw new WhatsAppMessageError("invalid_order_context");
    const itemLines = order.items.map((item) => {
      if (!Number.isInteger(item?.quantity) || item.quantity < 1 || item.quantity > 999) throw new WhatsAppMessageError("invalid_order_context");
      const unit = Number(item.unit_price);
      if (!Number.isFinite(unit) || unit < 0) throw new WhatsAppMessageError("invalid_order_context");
      const name = safeEnglish(item.product_name_snapshot, "Product name is not available in English.");
      const lineTotal = item.line_total == null ? unit * item.quantity : Number(item.line_total);
      if (!Number.isFinite(lineTotal) || lineTotal < 0) throw new WhatsAppMessageError("invalid_order_context");
      return `- ${name}\n  Quantity: ${item.quantity}\n  Unit price: EGP ${unit.toFixed(2)}\n  Line total: EGP ${lineTotal.toFixed(2)}`;
    });
    sections.push(`ITEMS\n${itemLines.join("\n")}`);
  }

  const paymentLines = [];
  if (order.payment_method) paymentLines.push(`Method: ${safeEnglish(order.payment_method === "cod" ? "Cash on Delivery" : order.payment_method)}`);
  if (order.payment_status) paymentLines.push(`Status: ${PAYMENT_LABELS[order.payment_status] ?? "Unavailable"}`);
  if (paymentLines.length) sections.push(`PAYMENT\n${paymentLines.join("\n")}`);

  const totalLines = [];
  for (const [key, label] of [["subtotal", "Subtotal"], ["discount_amount", "Promotion discount"], ["shipping_fee_amount", "Delivery charge"], ["shipping_discount_amount", "Delivery discount"], ["gift_packaging_fee_amount", "Gift packaging"], ["total_amount", "Final total"]]) {
    if (order[key] !== undefined && order[key] !== null) totalLines.push(amount(order[key], label));
  }
  if (order.promotion_code_snapshot) totalLines.push(`Promotion code: ${safeEnglish(order.promotion_code_snapshot)}`);
  if (totalLines.length) sections.push(`ORDER TOTAL\n${totalLines.join("\n")}`);

  const address = [order.governorate, order.city, order.address_line]
    .filter((value) => typeof value === "string" && value.trim())
    .map((value) => safeEnglish(value, ""))
    .filter(Boolean).join(", ");
  const deliveryLines = [];
  if (address) deliveryLines.push(`Address: ${address}`);
  if (typeof order.delivery_notes === "string" && order.delivery_notes.trim()) {
    const notes = safeEnglish(order.delivery_notes, "");
    if (notes) deliveryLines.push(`Notes: ${notes}`);
  }
  deliveryLines.push("Estimated delivery: 5-7 days. Timing may vary with order volume, carrier availability, and location.");
  sections.push(`DELIVERY\n${deliveryLines.join("\n")}`);
  return sections.join("\n\n");
}

export function buildDiscountCommunityMessage(promotion) {
  if (!promotion || typeof promotion !== "object" || typeof promotion.code !== "string" || !/^[A-Z0-9][A-Z0-9_-]{0,63}$/.test(promotion.code) || !["percentage", "fixed_amount"].includes(promotion.discount_type) || !Number.isFinite(Number(promotion.discount_value)) || Number(promotion.discount_value) <= 0) throw new WhatsAppMessageError("invalid_discount");
  const amountText = promotion.discount_type === "percentage" ? `${Number(promotion.discount_value)}% off` : `EGP ${Number(promotion.discount_value).toFixed(2)} off`;
  const title = safeEnglish(promotion.title, "Dr. Beauty offer");
  const lines = ["Purpose: Share a Dr. Beauty promotional offer.", "", "OFFER DETAILS", `Offer: ${title}`, `Discount: ${promotion.tiered_discount_enabled === true ? "Tiered discount; the highest eligible tier applies once." : amountText}`, `Code: ${promotion.code}`];
  const description = safeEnglish(promotion.description, "");
  if (description) lines.push(`Details: ${description}`);
  if (Number(promotion.minimum_subtotal) > 0) lines.push(`Minimum eligible subtotal: EGP ${Number(promotion.minimum_subtotal).toFixed(2)}`);
  if (Number(promotion.maximum_discount) > 0) lines.push(`Maximum discount: EGP ${Number(promotion.maximum_discount).toFixed(2)}`);
  if (Number.isSafeInteger(promotion.maximum_redemptions) && promotion.maximum_redemptions > 0) lines.push(`Total uses are limited to ${promotion.maximum_redemptions}.`);
  if (Number.isSafeInteger(promotion.per_account_redemption_limit) && promotion.per_account_redemption_limit > 0) lines.push(`Limit per account: ${promotion.per_account_redemption_limit}.`);
  if (promotion.first_purchase_only === true) lines.push("Eligibility: First qualifying purchase only.");
  const scope = promotion.application_scope ?? "order";
  if (scope === "products") lines.push("Applies to selected products only.");
  else if (scope === "categories") lines.push("Applies to selected categories only.");
  else if (scope === "product_and_category") lines.push("Applies to selected products or categories.");
  if (promotion.tiered_discount_enabled === true) {
    for (const tier of promotion.discount_tiers ?? []) {
      if (!tier || !Number.isFinite(Number(tier.minimumSubtotal ?? tier.minimum_subtotal)) || !Number.isFinite(Number(tier.discountValue ?? tier.discount_value))) continue;
      const minimum = Number(tier.minimumSubtotal ?? tier.minimum_subtotal).toFixed(2);
      const value = Number(tier.discountValue ?? tier.discount_value);
      const type = tier.discountType ?? tier.discount_type;
      lines.push(`- From EGP ${minimum}: ${type === "percentage" ? `${value}%` : `EGP ${value.toFixed(2)}`}${Number(tier.maximumDiscount ?? tier.maximum_discount) > 0 ? ` (maximum EGP ${Number(tier.maximumDiscount ?? tier.maximum_discount).toFixed(2)})` : ""}`);
    }
  }
  for (const [label, value] of [["Starts", promotion.starts_at], ["Ends", promotion.ends_at]]) {
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new WhatsAppMessageError("invalid_discount_date");
    lines.push(`${label}: ${new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Africa/Cairo" }).format(date)}`);
  }
  const targetPath = safeEnglish(promotion.target_path, "");
  if (targetPath.startsWith("/") && /^\/[\x21-\x7e]*$/.test(targetPath)) lines.push(`Shop: ${targetPath}`);
  lines.push("", "Enter the code at checkout. Eligibility and availability are checked when the order is placed.");
  return lines.join("\n");
}

export function buildCodOrderConfirmationUrl(destination, confirmation) {
  const orderReference = typeof confirmation?.orderNumber === "number" ? String(confirmation.orderNumber) : confirmation?.orderNumber;
  const validCustomerName = typeof confirmation?.customerName === "string" && confirmation.customerName.trim().length > 0 && confirmation.customerName.length <= 160;
  const validItems = Array.isArray(confirmation?.items) && confirmation.items.length > 0 && confirmation.items.length <= 50 && confirmation.items.every((item) => typeof item?.name === "string" && item.name.trim().length > 0 && item.name.length <= 240 && Number.isInteger(item.quantity) && item.quantity > 0 && item.quantity <= 999 && Number.isFinite(Number(item.unitPrice)) && Number(item.unitPrice) >= 0);
  if (typeof orderReference !== "string" || !/^\d{1,18}$/.test(orderReference) || confirmation?.currency !== "EGP" || !validCustomerName || !validItems) throw new WhatsAppMessageError("invalid_order_confirmation");
  const details = buildWhatsAppOrderContext({
    order_number: orderReference,
    created_at: confirmation.createdAt ?? confirmation.created_at,
    items: confirmation.items.map((item) => ({ product_name_snapshot: item.name, quantity: item.quantity, unit_price: item.unitPrice ?? item.unit_price, line_total: item.lineTotal ?? item.line_total })),
    subtotal: confirmation.subtotal,
    discount_amount: confirmation.discountAmount ?? confirmation.discount_amount,
    shipping_fee_amount: confirmation.shippingAmount ?? confirmation.shipping_fee_amount,
    shipping_discount_amount: confirmation.shippingDiscountAmount ?? confirmation.shipping_discount_amount,
    gift_packaging_fee_amount: confirmation.giftPackagingFeeAmount,
    total_amount: confirmation.totalAmount ?? confirmation.total_amount,
    payment_method: "cod",
    payment_status: "pending",
    order_status: "pending_confirmation",
    promotion_code_snapshot: confirmation.promotionCode ?? confirmation.promotion_code_snapshot,
    governorate: confirmation.governorate,
    city: confirmation.city,
    address_line: confirmation.addressLine ?? confirmation.address_line,
    delivery_notes: confirmation.deliveryNotes ?? confirmation.delivery_notes,
  });
  if (confirmation?.isGift) {
    const recipientName = typeof confirmation.giftRecipientName === "string" && confirmation.giftRecipientName.trim() && confirmation.giftRecipientName.length <= 160
      ? confirmation.giftRecipientName.trim() : null;
    if (!recipientName || typeof confirmation.giftPackagingSelected !== "boolean") throw new WhatsAppMessageError("invalid_order_confirmation");
    const giftMessage = typeof confirmation.giftMessage === "string" && confirmation.giftMessage.trim() ? confirmation.giftMessage.trim() : "No gift message provided";
    const packagingAmount = Number(confirmation.giftPackagingFeeAmount);
    if (!Number.isFinite(packagingAmount) || packagingAmount < 0 || (confirmation.giftPackagingSelected && packagingAmount <= 0) || (!confirmation.giftPackagingSelected && packagingAmount !== 0)) throw new WhatsAppMessageError("invalid_order_confirmation");
    return buildWhatsAppClickToChatUrl(destination, "order.gift_placed", {
      customerName: confirmation.customerName.trim(), orderReference,
      orderDetails: details, recipientName,
      giftMessage,
      giftPackaging: confirmation.giftPackagingSelected ? `Selected (EGP ${packagingAmount.toFixed(2)})` : "Not selected",
    });
  }
  return buildWhatsAppClickToChatUrl(destination, "order.placed", {
    customerName: confirmation.customerName.trim(), orderReference, orderDetails: details,
  });
}

export function getWhatsAppSupportDestination() {
  const configuredDestination = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER;
  const destination = typeof configuredDestination === "string" ? configuredDestination.trim() : "";
  return PHONE_PATTERN.test(destination) ? destination : null;
}
