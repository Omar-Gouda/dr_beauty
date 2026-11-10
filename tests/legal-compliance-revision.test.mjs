import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CURRENT_PRIVACY_VERSION, CURRENT_TERMS_VERSION } from "../src/lib/legal/policy-versions.mjs";
import { renderOrderEmail } from "../supabase/functions/notification-email-worker/templates.js";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("English and Arabic legal policies have matching complete sections, routes, dates, and language controls", async () => {
  const [terms, termsAr, privacy, privacyAr, legalPage, legacyTerms, legacyPrivacy] = await Promise.all([
    read("../src/app/(store)/terms-and-conditions/page.js"),
    read("../src/app/(store)/ar/terms-and-conditions/page.js"),
    read("../src/app/(store)/privacy-policy/page.js"),
    read("../src/app/(store)/ar/privacy-policy/page.js"),
    read("../src/components/legal/LegalPage.jsx"),
    read("../src/app/(store)/terms/page.js"),
    read("../src/app/(store)/privacy/page.js"),
  ]);
  for (const page of [terms, termsAr, privacy, privacyAr]) {
    assert.match(page, /effectiveDate = "(?:10 November 2026|10 نوفمبر 2026)"/);
    assert.match(page, /sections\.map/);
  }
  assert.equal((terms.match(/\["[a-z-]+",/g) ?? []).length, (termsAr.match(/\["[a-z-]+",/g) ?? []).length);
  assert.equal((privacy.match(/\["[a-z-]+",/g) ?? []).length, (privacyAr.match(/\["[a-z-]+",/g) ?? []).length);
  assert.match(termsAr, /lang="ar" dir="rtl"/);
  assert.match(privacyAr, /lang="ar" dir="rtl"/);
  assert.match(legalPage, /href=\{`#\$\{id\}`\}/);
  assert.match(terms, /alternateLanguageHref="\/ar\/terms-and-conditions"/);
  assert.match(termsAr, /alternateLanguageHref="\/terms-and-conditions"/);
  assert.match(privacy, /alternateLanguageHref="\/ar\/privacy-policy"/);
  assert.match(privacyAr, /alternateLanguageHref="\/privacy-policy"/);
  assert.match(legacyTerms, /redirect\("\/terms-and-conditions"\)/);
  assert.match(legacyPrivacy, /redirect\("\/privacy-policy"\)/);
});

test("terms accurately state operator, 5-7 day estimate, COD, 14/30-day rights, and no blanket cosmetics exception", async () => {
  const [terms, termsAr] = await Promise.all([
    read("../src/app/(store)/terms-and-conditions/page.js"),
    read("../src/app/(store)/ar/terms-and-conditions/page.js"),
  ]);
  for (const policy of [terms, termsAr]) {
    assert.match(policy, /Dr\. Beauty/);
    assert.match(policy, /14 days|١٤ يوماً/);
    assert.match(policy, /30-day period|٣٠ يوماً/);
    assert.match(policy, /seven days|سبعة أيام/);
    assert.match(policy, /5–7 days|٥–٧ أيام/);
    assert.match(policy, /Cash on Delivery|الدفع نقداً عند الاستلام/);
    assert.match(policy, /unconditional right|غير مشروط/);
    assert.match(policy, /not.*automatically excluded|مستثناة تلقائياً/);
    assert.match(policy, /same payment method|ذات طريقة الدفع/);
  }
  assert.doesNotMatch(terms, /all cosmetics are non-returnable|all beauty products are non-returnable/i);
  assert.match(terms, /Dr\. Radwa Hassan/);
  assert.match(terms, /mailto:radwahassan968@gmail\.com/);
  assert.doesNotMatch(terms, /\+?20\s?1\d{9}|commercial registration number is \d|residential address/i);
});

test("privacy notice discloses the actual 45-day operational retention and unresolved compliance facts", async () => {
  const [privacy, privacyAr] = await Promise.all([
    read("../src/app/(store)/privacy-policy/page.js"),
    read("../src/app/(store)/ar/privacy-policy/page.js"),
  ]);
  for (const policy of [privacy, privacyAr]) {
    assert.match(policy, /45 days|٤٥ يوماً/);
    assert.match(policy, /No separate accounting|لم يتبين وجود أرشيف منفصل/);
    assert.match(policy, /outside Egypt|خارجها/);
    assert.match(policy, /not.*verified|لا تثبت/);
    assert.match(policy, /does not ask.*age|لا يطلب الموقع حالياً عمر/);
    assert.match(policy, /explicit choice|اختياراً منفصلاً وصريحاً/);
    assert.match(policy, /withdrawal of consent|سحب الموافقة/);
  }
  assert.doesNotMatch(privacy, /all data is deleted after 45 days/i);
  assert.doesNotMatch(privacy, /100% safe|never shared/i);
  assert.doesNotMatch(privacy, /Supabase|Resend|Vercel/);
});

test("policy revisions require new acceptance and public ranking becomes opt-in", async () => {
  const migration = await read("../supabase/migrations/20261208000000_legal_policy_revision_explicit_ranking_optin.sql");
  const profilePage = await read("../src/app/(account)/profile/page.js");
  const profileEditor = await read("../src/components/account/ProfileEditor.jsx");
  const registerForm = await read("../src/components/account/AuthForm.jsx");
  assert.equal(CURRENT_TERMS_VERSION, "terms-2026-11-10-r2");
  assert.equal(CURRENT_PRIVACY_VERSION, "privacy-2026-11-10-r2");
  assert.match(migration, /update private\.current_policy_versions[\s\S]*terms-2026-11-10-r2[\s\S]*privacy-2026-11-10-r2/);
  assert.match(migration, /alter column show_public_ranking set default false/i);
  assert.match(migration, /update public\.profiles[\s\S]*set show_public_ranking = false/i);
  assert.match(profilePage, /show_public_ranking === true/);
  assert.match(profileEditor, /draft\.showPublicRanking === true/g);
  assert.match(registerForm, /name="policyConsent" type="checkbox" value="accepted" required/);
  assert.doesNotMatch(registerForm, /name="policyConsent"[^>]*checked/);
});

test("checkout confirmation remains accessible and shows saved order details without treating WhatsApp as required", async () => {
  const [checkoutAction, checkout, accountReceipt, retention, whatsapp] = await Promise.all([
    read("../src/app/(checkout)/checkout/actions.js"),
    read("../src/app/(checkout)/checkout/CheckoutForm.jsx"),
    read("../src/app/(account)/orders/[orderNumber]/page.js"),
    read("../supabase/migrations/20261120000000_order_retention_deletion_redemption_ledger.sql"),
    read("../src/lib/whatsapp/messages.mjs"),
  ]);
  assert.match(checkoutAction, /\.eq\("user_id", authenticatedUserId\)/);
  assert.match(checkoutAction, /product_name_snapshot,quantity,unit_price/);
  assert.match(checkout, /Items subtotal/);
  assert.match(checkout, /Total due on delivery/);
  assert.match(checkout, /Delivery destination/);
  assert.match(checkout, /Estimated delivery: 5–7 days/);
  assert.match(checkout, /not a tax invoice/);
  assert.match(checkout, /useState\(false\)/);
  assert.match(accountReceipt, /\.eq\("user_id", user\.id\)/);
  assert.match(accountReceipt, /Order summary/);
  assert.match(accountReceipt, /not a tax invoice/);
  assert.match(retention, /interval '45 days'/);
  assert.match(checkout, /This is not marketing consent/);
});

test("order-confirmation email includes the available financial snapshot and does not report COD as already paid", () => {
  const email = renderOrderEmail({
    delivery_type: "order_confirmation", order_number: "123", customer_name: "Customer",
    order_created_at: "2026-11-10T10:00:00.000Z", currency: "EGP", subtotal: "100.00", discount_amount: "10.00",
    shipping_amount: "20.00", total_amount: "110.00", current_order_status: "pending_confirmation",
    notification_status: null, shipping_carrier: null, tracking_number: null, tracking_url: null,
    items: [{ product_name_snapshot: "Product", quantity: 1, unit_price: "100.00", line_total: "100.00" }],
  });
  for (const text of [email.html, email.text]) {
    assert.match(text, /Order #123/);
    assert.match(text, /EGP 100\.00/);
    assert.match(text, /EGP 10\.00/);
    assert.match(text, /EGP 20\.00/);
    assert.match(text, /EGP 110\.00/);
    assert.match(text, /Cash on delivery/);
    assert.match(text, /does not mean payment has been collected/);
    assert.match(text, /5–7 days/);
    assert.match(text, /not a tax invoice/);
  }
});
