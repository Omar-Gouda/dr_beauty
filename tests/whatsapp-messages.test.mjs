import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCodOrderConfirmationUrl,
  buildDiscountCommunityMessage,
  buildWhatsAppClickToChatUrl,
  buildWhatsAppOrderContext,
  getWhatsAppTemplate,
  normalizeWhatsAppPhoneNumber,
  renderWhatsAppMessage,
  WhatsAppMessageError,
} from "../src/lib/whatsapp/messages.mjs";

const templateIds = ["support.general", "support.request", "support.return_request", "account.access", "account.question", "order.existing", "order.confirmation", "order.placed", "order.gift_placed", "order.status", "order.change", "order.cancel", "order.delivery", "order.item_issue", "product.question", "product.availability", "product.restock", "product.recommendation", "wishlist.question", "wishlist.back_in_stock", "consultation.beauty_tips", "admin.order_contact", "admin.order_status", "admin.support_followup"];

test("every WhatsApp template is English, purpose-first, multiline, and declares all variables", () => {
  for (const id of templateIds) {
    const template = getWhatsAppTemplate(id);
    assert.ok(template, `missing ${id}`);
    assert.match(template.text, /^Purpose: /);
    assert.match(template.text, /\n\n/);
    assert.doesNotMatch(template.text, /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u);
    const placeholders = [...template.text.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(placeholders)].sort(), [...template.variables, ...template.optionalVariables].sort());
  }
});

test("order confirmation has readable sections, historical line values, COD status, and English-only fallback", () => {
  const url = buildCodOrderConfirmationUrl("201000000000", {
    orderNumber: "12345", currency: "EGP", customerName: "Salma Mohamed",
    created_at: "2026-11-10T10:00:00Z", payment_method: "cod", payment_status: "pending",
    subtotal: "2100.00", discount_amount: "250.00", shipping_fee_amount: "60.00", shipping_discount_amount: "0.00",
    total_amount: "1910.00", governorate: "Cairo", city: "Nasr City", address_line: "Street 1", delivery_notes: "Call on arrival",
    items: [{ name: "Calm & Clear Cleanser", quantity: 2, unitPrice: "500.00" }, { name: "Daily SPF", quantity: 1, unitPrice: "1100.00" }],
  });
  const message = new URL(url).searchParams.get("text");
  assert.match(message, /^Purpose: /);
  for (const value of ["CUSTOMER DETAILS", "Name: Salma Mohamed", "ORDER DETAILS", "ITEMS", "- Calm & Clear Cleanser", "Quantity: 2", "Unit price: EGP 500.00", "Line total: EGP 1000.00", "PAYMENT", "Method: Cash on Delivery", "Status: Pending collection", "Subtotal: EGP 2100.00", "Promotion discount: EGP 250.00", "Delivery charge: EGP 60.00", "Final total: EGP 1910.00", "Address: Cairo, Nasr City, Street 1", "Estimated delivery: 5-7 days"]) assert.ok(message.includes(value), `message includes ${value}`);
  assert.match(message, /\n\n/);
  assert.doesNotMatch(message, /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u);
  assert.doesNotMatch(message, /password|token|card number|010\d{8}/i);

  const arabicValueUrl = buildCodOrderConfirmationUrl("201000000000", {
    orderNumber: "12", currency: "EGP", customerName: "عميل", items: [{ name: "منتج", quantity: 1, unitPrice: "10.00" }],
  });
  assert.doesNotMatch(new URL(arabicValueUrl).searchParams.get("text"), /[\u0600-\u06ff]/u);
});

test("order context preserves multi-line item details and omits unrelated contacts", () => {
  const context = buildWhatsAppOrderContext({
    order_number: 44, created_at: "2026-11-10T10:00:00Z", order_status: "pending_confirmation", payment_method: "cod", payment_status: "pending",
    subtotal: "100.00", discount_amount: "10.00", shipping_fee_amount: "20.00", shipping_discount_amount: "5.00", total_amount: "105.00",
    governorate: "Cairo", city: "Nasr City", address_line: "Street 1", delivery_notes: "Ring bell",
    customer_email: "private@example.test", customer_phone: "01000000000",
    items: [{ product_name_snapshot: "Product", quantity: 1, unit_price: "100.00" }],
  });
  assert.match(context, /\n\nITEMS\n- Product\n  Quantity: 1/);
  assert.match(context, /Final total: EGP 105\.00/);
  assert.match(context, /Method: Cash on Delivery/);
  assert.match(context, /Status: Pending collection/);
  assert.doesNotMatch(context, /private@example|01000000000|[\u0600-\u06ff]/u);
});

test("support, return, refund, and issue drafts preserve English input and replace non-English free text clearly", () => {
  const text = renderWhatsAppMessage("support.return_request", {
    category: "Return request", orderReference: "123", productName: "Cream",
    question: "Seal arrived open", requestedAction: "Review and advise next steps",
  });
  assert.match(text, /^Purpose: /);
  assert.match(text, /REQUEST DETAILS\nRequest type: Return request/);
  for (const value of ["123", "Cream", "Seal arrived open", "Review and advise next steps"]) assert.ok(text.includes(value));
  const englishOnly = renderWhatsAppMessage("support.request", { category: "مساعدة", question: "مشكلة في المنتج" });
  assert.match(englishOnly, /Category: Not provided in English/);
  assert.match(englishOnly, /Please add the request details in English before sending/);
  assert.doesNotMatch(englishOnly, /[\u0600-\u06ff]/u);
});

test("gift draft includes relevant order information and contains no buyer contact data", () => {
  const url = buildCodOrderConfirmationUrl("201000000000", {
    orderNumber: "12345", totalAmount: "1090.00", currency: "EGP", customerName: "Buyer Name",
    items: [{ name: "Daily SPF", quantity: 1, unitPrice: "1090.00" }], isGift: true,
    giftRecipientName: "Recipient Name", giftMessage: "Enjoy your gift", giftPackagingSelected: true, giftPackagingFeeAmount: "30.00",
  });
  const message = new URL(url).searchParams.get("text");
  assert.match(message, /^Purpose: /);
  assert.match(message, /GIFT DETAILS\nRecipient: Recipient Name/);
  assert.match(message, /Enjoy your gift/);
  assert.match(message, /Buyer Name/);
  assert.doesNotMatch(message, /\+?20\d{10,}/);
});

test("promotion message is English-only, sectioned, purpose-first, and formats values as EGP", () => {
  const message = buildDiscountCommunityMessage({ code: "GLOW10", title: "Spring glow", discount_type: "percentage", discount_value: "10", maximum_discount: "250", minimum_subtotal: "500", maximum_redemptions: 100, starts_at: "2026-10-01T00:00:00Z", ends_at: "2026-10-31T23:59:59Z" });
  assert.match(message, /^Purpose: /);
  assert.match(message, /\n\nOFFER DETAILS/);
  assert.match(message, /Code: GLOW10/);
  assert.match(message, /Minimum eligible subtotal: EGP 500\.00/);
  assert.match(message, /Maximum discount: EGP 250\.00/);
  assert.doesNotMatch(message, /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u);
  const nonEnglishPath = buildDiscountCommunityMessage({
    code: "GLOW10", title: "Spring glow", discount_type: "percentage", discount_value: 10,
    target_path: "/ar/عروض",
  });
  assert.doesNotMatch(nonEnglishPath, /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff]/u);
  assert.doesNotMatch(nonEnglishPath, /Shop:/);
});

test("admin order status messages present readable English status labels", () => {
  const message = renderWhatsAppMessage("admin.order_status", { orderReference: 123, orderStatus: "pending_confirmation" });
  assert.match(message, /Current status: Pending confirmation/);
  assert.doesNotMatch(message, /pending_confirmation/);
});

test("URL encoding retains readable line breaks, optional values disappear, and phone validation remains safe", () => {
  assert.throws(() => renderWhatsAppMessage("order.status"), (error) => error.code === "missing_variable");
  assert.throws(() => renderWhatsAppMessage("support.general", { customerEmail: "x@y.test" }), (error) => error.code === "unexpected_variable");
  assert.throws(() => renderWhatsAppMessage("product.question", { productName: undefined }), (error) => error.code === "missing_variable");
  assert.throws(() => buildWhatsAppClickToChatUrl("+201000000000", "support.general"), WhatsAppMessageError);
  const url = buildWhatsAppClickToChatUrl("201000000000", "order.existing", { orderReference: "123", orderContext: "ORDER DETAILS\nTotal: EGP 10.00" });
  const raw = new URL(url).searchParams.get("text");
  assert.match(raw, /\n/);
  assert.match(raw, /\n\n/);
  assert.match(raw, /Order number: #123/);
  assert.doesNotMatch(raw, /undefined|null|{{|}}/i);
  assert.equal(normalizeWhatsAppPhoneNumber("010 1234 5678"), "201012345678");
  assert.equal(normalizeWhatsAppPhoneNumber("+20 (10) 1234-5678"), "201012345678");
});
