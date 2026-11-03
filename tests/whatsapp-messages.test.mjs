import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWhatsAppClickToChatUrl,
  buildCodOrderConfirmationUrl,
  getWhatsAppTemplate,
  getWhatsAppSupportDestination,
  normalizeWhatsAppPhoneNumber,
  buildDiscountCommunityMessage,
  renderWhatsAppMessage,
  WhatsAppMessageError,
} from "../src/lib/whatsapp/messages.mjs";

test("message catalog exposes the requested account, support, order, product, wishlist, and admin categories", () => {
  const ids = [
    "support.general", "account.access", "account.question", "order.existing", "order.confirmation", "order.placed", "order.gift_placed", "order.status",
    "order.change", "order.cancel", "order.delivery", "order.item_issue", "product.question",
    "product.availability", "product.restock", "product.recommendation", "wishlist.question",
    "wishlist.back_in_stock", "consultation.beauty_tips", "admin.order_contact", "admin.order_status", "admin.support_followup",
  ];
  for (const id of ids) {
    const template = getWhatsAppTemplate(id);
    assert.ok(template, `missing ${id}`);
    assert.equal(typeof template.purpose, "string");
    assert.ok(template.purpose.length > 0);
    const placeholders = [...template.text.matchAll(/{{\s*([a-zA-Z][a-zA-Z0-9]*)\s*}}/g)].map((match) => match[1]);
    assert.deepEqual([...new Set(placeholders)].sort(), [...template.variables].sort(), `variable declaration mismatch for ${id}`);
  }
});

test("template definitions cannot be mutated by callers", () => {
  const template = getWhatsAppTemplate("order.status");
  assert.throws(() => { template.variables.push("customerPhone"); }, TypeError);
  assert.throws(() => { template.text = "changed"; }, TypeError);
  assert.deepEqual(getWhatsAppTemplate("order.status").variables, ["orderReference"]);
});

test("permitted variables interpolate safely and URL text is correctly encoded", () => {
  const url = buildWhatsAppClickToChatUrl("201000000000", "product.question", { productName: "Calm & Clear? كريم" });
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://wa.me");
  assert.equal(parsed.pathname, "/201000000000");
  assert.equal(parsed.searchParams.get("text"), "Hello Dr. Beauty, I have a question about Calm & Clear? كريم.");
  assert.match(url, /%26/);
});

test("COD WhatsApp handoff uses only a validated persisted order confirmation", () => {
  const url = buildCodOrderConfirmationUrl("201000000000", {
    orderNumber: "12345", status: "pending_confirmation", totalAmount: "1060.00", currency: "EGP",
    customerName: "Salma Mohamed",
    items: [{ name: "Calm & Clear Cleanser", quantity: 2 }, { name: "Daily SPF", quantity: 1 }],
  });
  const message = new URL(url).searchParams.get("text");
  assert.match(message, /my name is Salma Mohamed/);
  assert.match(message, /order #12345/);
  assert.match(message, /Calm & Clear Cleanser x 2; Daily SPF x 1/);
  assert.match(message, /status is pending confirmation/);
  assert.match(message, /total is EGP 1060\.00/);
  assert.throws(() => buildCodOrderConfirmationUrl("201000000000", null), (error) => error.code === "invalid_order_confirmation");
  assert.throws(() => buildCodOrderConfirmationUrl("201000000000", {
    orderNumber: "12345", status: "pending_confirmation", totalAmount: "1060.00", currency: "USD",
    customerName: "Salma Mohamed", items: [{ name: "Daily SPF", quantity: 1 }],
  }), (error) => error.code === "invalid_order_confirmation");
  assert.throws(() => buildCodOrderConfirmationUrl("201000000000", {
    orderNumber: "12345", status: "pending_confirmation", totalAmount: "1060.00", currency: "EGP",
    customerName: "Salma Mohamed", items: [],
  }), (error) => error.code === "invalid_order_confirmation");
});

test("gift COD WhatsApp draft identifies the order, recipient, dedication, and configured packaging fee", () => {
  const url = buildCodOrderConfirmationUrl("201000000000", {
    orderNumber: "12345", status: "pending_confirmation", totalAmount: "1090.00", currency: "EGP",
    customerName: "Buyer Name", items: [{ name: "Daily SPF", quantity: 1 }],
    isGift: true, giftRecipientName: "Recipient Name", giftMessage: "Enjoy your gift",
    giftPackagingSelected: true, giftPackagingFeeAmount: "30.00",
  });
  const message = new URL(url).searchParams.get("text");
  assert.match(message, /gift order #12345/);
  assert.match(message, /for Recipient Name/);
  assert.match(message, /Dedication: Enjoy your gift/);
  assert.match(message, /Gift packaging: Included \(EGP 30\.00\)/);
  assert.doesNotMatch(message, /Buyer Name|Daily SPF|1090\.00/);

  const withoutPackaging = buildCodOrderConfirmationUrl("201000000000", {
    orderNumber: "12345", status: "pending_confirmation", totalAmount: "1060.00", currency: "EGP",
    customerName: "Buyer Name", items: [{ name: "Daily SPF", quantity: 1 }],
    isGift: true, giftRecipientName: "Recipient Name", giftPackagingSelected: false, giftPackagingFeeAmount: "0",
  });
  assert.match(new URL(withoutPackaging).searchParams.get("text"), /Gift packaging: Not requested/);
});

test("beauty consultation and admin status drafts use the selected context and encode safely", () => {
  const consultation = new URL(buildWhatsAppClickToChatUrl("201000000000", "consultation.beauty_tips", {
    category: "Skincare & routine",
    productName: "Calm & Clear",
    question: "What routine fits my skin?",
  }));
  assert.match(consultation.searchParams.get("text"), /Category: Skincare & routine/);
  assert.match(consultation.searchParams.get("text"), /Product: Calm & Clear/);
  assert.match(consultation.searchParams.get("text"), /My question: What routine fits my skin\?/);
  assert.match(consultation.href, /%26/);

  const adminStatus = new URL(buildWhatsAppClickToChatUrl("201000000000", "admin.order_status", {
    orderReference: "12345",
    orderStatus: "out for delivery",
  }));
  assert.match(adminStatus.searchParams.get("text"), /order #12345/);
  assert.match(adminStatus.searchParams.get("text"), /status is now out for delivery/);
});

test("missing, unexpected, and unresolved template variables are rejected", () => {
  assert.throws(() => renderWhatsAppMessage("order.status"), (error) => error.code === "missing_variable");
  assert.throws(() => renderWhatsAppMessage("support.general", { customerEmail: "someone@example.com" }), (error) => error.code === "unexpected_variable");
  assert.throws(() => renderWhatsAppMessage("product.question", { productName: undefined }), (error) => error.code === "missing_variable");
  assert.throws(() => renderWhatsAppMessage("missing.template"), WhatsAppMessageError);
});

test("Click-to-Chat accepts only international digit-only destinations", () => {
  for (const phone of ["+201000000000", "020100000000", "2010 0000 0000", "2010-000-0000", "1234567"]) {
    assert.throws(() => buildWhatsAppClickToChatUrl(phone, "support.general"), (error) => error.code === "invalid_destination");
  }
  assert.equal(buildWhatsAppClickToChatUrl("201000000000", "support.general").startsWith("https://wa.me/201000000000?text="), true);
});

test("support destination is absent when not configured and rejects malformed values", () => {
  const original = process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER;
  try {
    delete process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER;
    assert.equal(getWhatsAppSupportDestination(), null);
    process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER = "+201000000000";
    assert.equal(getWhatsAppSupportDestination(), null);
    process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER = "201000000000";
    assert.equal(getWhatsAppSupportDestination(), "201000000000");
  } finally {
    if (original === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER;
    else process.env.NEXT_PUBLIC_WHATSAPP_SUPPORT_NUMBER = original;
  }
});

test("saved Egyptian customer phone formats normalize to WhatsApp international digits", () => {
  assert.equal(normalizeWhatsAppPhoneNumber("010 1234 5678"), "201012345678");
  assert.equal(normalizeWhatsAppPhoneNumber("+20 (10) 1234-5678"), "201012345678");
  assert.equal(normalizeWhatsAppPhoneNumber("00201012345678"), "201012345678");
  assert.equal(normalizeWhatsAppPhoneNumber("201012345678"), "201012345678");
  assert.equal(normalizeWhatsAppPhoneNumber("not a phone"), null);
  assert.equal(normalizeWhatsAppPhoneNumber("1234567"), null);
});

test("community share text is built from the saved coupon fields and names code eligibility", () => {
  const message = buildDiscountCommunityMessage({
    code: "GLOW10", title: "Spring glow", description: "A seasonal skincare saving.",
    discount_type: "percentage", discount_value: "10", maximum_discount: "250",
    minimum_subtotal: "500", maximum_redemptions: 100, starts_at: "2026-10-01T00:00:00Z",
    ends_at: "2026-10-31T23:59:59Z", target_path: "/shop",
  });
  assert.match(message, /Spring glow/);
  assert.match(message, /Code: GLOW10/);
  assert.match(message, /10% off/);
  assert.match(message, /Minimum subtotal: EGP 500\.00/);
  assert.match(message, /Limited to 100 redemptions/);
  assert.match(message, /Enter this code at checkout/);
});

