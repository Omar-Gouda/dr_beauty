import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

test("customer support, product, wishlist, order, and admin entry points use shared click-to-chat actions", async () => {
  const [support, card, detail, featured, wishlist, order, checkout, checkoutAction, adminOrders, adminRequests, action, consultation, lifecycle, adminAction, addressPage, whatsappAction] = await Promise.all([
    source("../src/components/requests/CustomerRequestPage.jsx"),
    source("../src/components/products/ProductCard.jsx"),
    source("../src/components/products/ProductDetail.jsx"),
    source("../src/components/home/FeaturedProducts.jsx"),
    source("../src/app/(store)/wishlist/page.js"),
    source("../src/app/(account)/orders/[orderNumber]/page.js"),
    source("../src/app/(checkout)/checkout/CheckoutForm.jsx"),
    source("../src/app/(checkout)/checkout/actions.js"),
    source("../src/components/admin/AdminOrdersManager.jsx"),
    source("../src/components/admin/CustomerRequestReview.jsx"),
    source("../src/components/whatsapp/WhatsAppAction.jsx"),
    source("../src/components/requests/CustomerRequestForm.jsx"),
    source("../src/components/admin/OrderLifecycleControls.jsx"),
    source("../src/app/admin/actions.js"),
    source("../src/app/(account)/addresses/page.js"),
    source("../src/components/whatsapp/WhatsAppAction.jsx"),
  ]);

  assert.doesNotMatch(support, /<WhatsAppAction/);
  for (const template of ["product.availability", "product.question", "product.restock", "wishlist.back_in_stock", "wishlist.question", "product.recommendation"]) {
    assert.match(`${card}\n${detail}\n${featured}\n${wishlist}`, new RegExp(template.replaceAll(".", "\\.")));
  }
  for (const template of ["order.status", "order.confirmation", "order.change", "order.cancel", "order.delivery", "order.item_issue"]) {
    assert.match(`${order}\n${checkout}`, new RegExp(template.replaceAll(".", "\\.")));
  }
  assert.match(adminOrders, /admin\.order_contact/);
  assert.match(adminRequests, /admin\.support_followup/);
  assert.match(action, /buildWhatsAppClickToChatUrl/);
  assert.match(action, /WhatsApp contact is not configured yet/);
  assert.match(action, /message is not sent until you send it/);
  assert.match(consultation, /consultation\.beauty_tips/);
  assert.match(consultation, /"support\.request"/);
  assert.match(consultation, /Save \$\{requestType === "beauty_tips" \? "request" : "support request"\} & open WhatsApp draft/);
  assert.match(consultation, /await submitCustomerServiceRequest\(INITIAL_STATE, formData\)/);
  assert.match(consultation, /popup\.location\.replace\(url\)/);
  assert.ok(consultation.indexOf("await submitCustomerServiceRequest(INITIAL_STATE, formData)") < consultation.indexOf("popup.location.replace(url)"));
  assert.match(consultation, /if \(!result\.ok\)[\s\S]*?popup\?\.close\(\)/);
  assert.match(consultation, /nothing was sent automatically/);
  assert.match(checkout, /buildCodOrderConfirmationUrl/);
  assert.doesNotMatch(checkout, /window\.open\(|whatsappPopupRef|popup\.location\.replace/);
  assert.match(checkout, /WhatsAppAction className="mb-3 w-full" preparedUrl=\{confirmation\.whatsappUrl\}/);
  assert.match(checkout, /confirmation\.whatsappStatus === "consent_not_given"/);
  assert.match(checkout, /confirmation\.whatsappStatus === "not_configured"/);
  assert.match(checkout, /Reopening it will not create another order/);
  assert.match(checkout, /attempt\.whatsappConsent/);
  assert.match(checkoutAction, /\.from\("orders"\)[\s\S]*?\.eq\("user_id", authenticatedUserId\)/);
  assert.match(checkoutAction, /\.from\("order_items"\)[\s\S]*?product_name_snapshot,quantity/);
  assert.match(checkoutAction, /confirmationDetails\?\.items \?\? null/);
  assert.match(checkoutAction, /Order creation already succeeded/);
  assert.match(whatsappAction, /normalizeWhatsAppPhoneNumber\(destination\)/);
  assert.match(lifecycle, /window\.open\("about:blank", "_blank"\)/);
  assert.match(lifecycle, /result\.ok && result\.whatsappUrl/);
  assert.match(lifecycle, /WhatsAppAction preparedUrl=/);
  assert.match(adminAction, /currentOrder\.customer_phone/);
  assert.match(adminAction, /admin\.order_status/);
  assert.match(adminAction, /normalizeWhatsAppPhoneNumber\(currentOrder\.customer_phone\)/);
  assert.match(consultation, /buildWhatsAppClickToChatUrl\(destination, "support\.request"/);
});

test("Address Book uses the shared account shell without its obsolete page-only navigation", async () => {
  const page = await source("../src/app/(account)/addresses/page.js");
  assert.doesNotMatch(page, /AccountNavigation/);
  assert.match(page, /<AddressBookManager addresses=\{addresses \?\? \[\]\} \/>/);
  assert.match(page, /\.eq\("user_id", user\.id\)/);
  assert.match(page, /max-w-4xl/);
  assert.match(page, /Your space/);
});
