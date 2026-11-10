import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("checkout form presents profile defaults, complete address fields, and independent gift details", async () => {
  const [page, form] = await Promise.all([
    read("../src/app/(checkout)/checkout/page.js"),
    read("../src/app/(checkout)/checkout/CheckoutForm.jsx"),
  ]);
  assert.match(page, /\.from\("profiles"\)\.select\("full_name,phone"\)\.eq\("id", user\.id\)/);
  assert.match(page, /\.from\("customer_addresses"\)[\s\S]*?\.eq\("user_id", user\.id\)/);
  for (const field of ["governorate", "city", "address", "additionalPhone", "giftRecipientName", "giftRecipientPhone", "giftMessage"]) {
    assert.match(form, new RegExp(`name="${field}"|id="${field}"`), `${field} is present in checkout`);
  }
  assert.match(form, /giftRecipientName: address\?\.recipient_name/);
  assert.match(form, /giftRecipientPhone: address\?\.phone/);
  assert.match(form, /Save this new delivery address to my Address Book/);
  assert.match(form, /Your profile number remains primary/);
});

test("checkout action validates additional and recipient phone numbers and calls the extended RPC contract", async () => {
  const action = await read("../src/app/(checkout)/checkout/actions.js");
  assert.match(action, /import \{ normalizeWhatsAppPhoneNumber \} from "@\/lib\/whatsapp\/messages\.mjs"/);
  assert.match(action, /additionalPhoneInput && !additionalPhone/);
  assert.match(action, /isGift && \(!giftRecipientName \|\| !giftRecipientPhone\)/);
  assert.match(action, /\.from\("customer_addresses"\)[\s\S]*?\.eq\("user_id", authenticatedUserId\)/);
  for (const argument of ["p_address_id", "p_additional_phone", "p_is_gift", "p_gift_recipient_name", "p_gift_recipient_phone", "p_gift_message", "p_gift_packaging_selected", "p_save_new_address"]) {
    assert.match(action, new RegExp(`${argument}:`));
  }
  assert.match(action, /Order creation already succeeded/);
});

test("gift packaging amount is read from server configuration and bound to an idempotent order", async () => {
  const migration = await read("../supabase/migrations/20261113000000_checkout_profile_gifts.sql");
  assert.match(migration, /select s\.gift_packaging_fee into v_fee[\s\S]*?from public\.shipping_settings as s/);
  assert.match(migration, /v_existing_payload ->> 'gift_packaging_fee'/);
  assert.match(migration, /v_existing_payload is distinct from v_payload/);
  assert.match(migration, /create trigger orders_set_total_amount_before_insert\s+before insert on public\.orders/i);
  assert.match(migration, /new\.total_amount := new\.subtotal \+ new\.shipping_amount\s*\+ new\.gift_packaging_fee_amount - new\.discount_amount/);
  assert.match(migration, /alter table public\.orders alter column total_amount set not null/i);
  assert.match(migration, /total_amount is not null\s+and total_amount = subtotal \+ shipping_amount \+ gift_packaging_fee_amount - discount_amount/i);
  assert.match(migration, /total_amount = o\.subtotal \+ o\.shipping_amount \+ v_fee - o\.discount_amount/);
  assert.doesNotMatch(migration, /total_amount = o\.total_amount\s*\+\s*v_fee/);
  assert.match(migration, /where a\.id = p_address_id and a\.user_id = v_user_id/);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /create function private\.set_order_total_amount\(\)[\s\S]*?set search_path = ''/i);
  assert.match(migration, /grant execute on function public\.create_cod_order_with_whatsapp_consent\([\s\S]*?\) to authenticated/i);
  assert.doesNotMatch(migration, /p_gift_packaging_fee|p_total_amount/);
});

test("mobile navigation uses an accessible hamburger dialog instead of a fixed footer bar", async () => {
  const [navigation, css, storeLayout, accountLayout, checkoutLayout, footer] = await Promise.all([
    read("../src/components/layout/Navbar.jsx"),
    read("../src/app/globals.css"),
    read("../src/components/layout/StoreLayout.jsx"),
    read("../src/app/(account)/layout.js"),
    read("../src/app/(checkout)/layout.js"),
    read("../src/components/layout/Footer.jsx"),
  ]);
  assert.match(navigation, /aria-label="Open navigation menu"/);
  assert.match(navigation, /<AccessibleDialog onClose=\{closeMobileMenu\}/);
  assert.match(navigation, /document\.body\.style\.overflow = "hidden"/);
  assert.match(navigation, /onClick=\{closeMobileMenu\}/);
  assert.match(navigation, /Dr\. Radwa Hassan/);
  assert.match(css, /mobile-menu-panel/);
  assert.match(css, /env\(safe-area-inset-top\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  for (const layout of [storeLayout, accountLayout, checkoutLayout]) assert.doesNotMatch(layout, /MobileBottomNavigation/);
  assert.doesNotMatch(footer, /aria-label="Customer care and store links"/);
  assert.doesNotMatch(css, /mobile-bottom-nav/);
});
