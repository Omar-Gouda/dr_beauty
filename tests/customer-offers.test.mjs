import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("storefront promotions use the redeemable featured-promotion projection", async () => {
  const [catalog, route, policy, checkout, shippingMigration, eligibilityMigration] = await Promise.all([
    read("../src/lib/catalog.js"),
    read("../src/app/(store)/offers/page.js"),
    read("../supabase/migrations/20261021000000_initial_schema.sql"),
    read("../supabase/migrations/20261112000000_checkout_discount_least_expression_fix.sql"),
    read("../supabase/migrations/20261109000000_shipping_configuration_featured_promotions_and_reviews.sql"),
    read("../supabase/migrations/20261115000000_public_redeemable_featured_promotions.sql"),
  ]);
  assert.match(catalog, /export async function getCustomerOffers/);
  assert.match(catalog, /rpc\("get_public_featured_promotions", \{ p_limit: 12 \}\)/);
  assert.match(catalog, /rpc\("get_public_featured_promotions", \{ p_limit: 24 \}\)/);
  assert.doesNotMatch(catalog, /\.is\("maximum_redemptions", null\)/);
  assert.match(policy, /create policy promotions_public_read[\s\S]*?is_active[\s\S]*?starts_at[\s\S]*?ends_at/);
  assert.match(catalog, /from\("shipping_settings"\)[\s\S]*?free_shipping_minimum_subtotal/);
  assert.match(route, /Enjoy free delivery when your eligible product subtotal is above/);
  assert.match(checkout, /v_subtotal > v_shipping_settings\.free_shipping_minimum_subtotal/);
  assert.match(shippingMigration, /shipping_settings_public_read/);
  assert.match(route, /Use code/);
  assert.match(checkout, /p_promotion_code text default null/);
  assert.match(checkout, /v_redemptions >= v_promotion\.maximum_redemptions/);
  assert.match(eligibilityMigration, /security definer\s+set search_path = ''/i);
  assert.match(eligibilityMigration, /promotion\.is_featured\s+and promotion\.is_active/);
  assert.match(eligibilityMigration, /promotion\.starts_at <= pg_catalog\.statement_timestamp\(\)/);
  assert.match(eligibilityMigration, /promotion\.ends_at > pg_catalog\.statement_timestamp\(\)/);
  assert.match(eligibilityMigration, /count\(\*\)[\s\S]*?existing_order\.order_status <> 'cancelled'[\s\S]*?\)\s*< promotion\.maximum_redemptions/);
  assert.match(eligibilityMigration, /order by promotion\.display_priority desc, promotion\.code asc/);
  assert.match(eligibilityMigration, /grant execute on function public\.get_public_featured_promotions\(integer\)\s+to anon, authenticated/);
  assert.doesNotMatch(route, /promotion system supports|checkout coupon campaigns|separate verified checkout model|database|RPC|migration|eligibility is rechecked/i);
  assert.doesNotMatch(route, /AdminPromotionsManager|Add Discount|Create Discount|Edit Discount/);
  assert.match(route, /A little extra for your routine/);
});

test("public customer request validation uses customer-facing language", async () => {
  const actions = await read("../src/app/(store)/actions.js");
  assert.doesNotMatch(actions, /unsupported (?:order|product) reference/);
  assert.match(actions, /remove the order details from your beauty advice request/);
  assert.match(actions, /remove the product selection from your support request/);
});

test("offers route and public request pages defer live reads within Suspense", async () => {
  const [offers, request, tips, support, layout] = await Promise.all([
    read("../src/app/(store)/offers/page.js"),
    read("../src/components/requests/CustomerRequestPage.jsx"),
    read("../src/app/(store)/beauty-tips/page.js"),
    read("../src/app/(store)/support/page.js"),
    read("../src/components/layout/StoreLayout.jsx"),
  ]);
  assert.match(request, /await connection\(\);[\s\S]*?getCustomerRequestContext/);
  assert.match(tips, /<Suspense fallback=/);
  assert.match(support, /<Suspense fallback=/);
  assert.match(offers, /await connection\(\)/);
  assert.match(offers, /<Suspense fallback=/);
  assert.match(layout, /await connection\(\)/);
});

test("announcement bar renders individual messages, hides empty results, and honors reduced motion", async () => {
  const [bar, styles] = await Promise.all([
    read("../src/components/layout/AnnouncementBar.jsx"),
    read("../src/app/globals.css"),
  ]);
  assert.match(bar, /if \(!loading && announcements\.length === 0\) return null/);
  assert.match(bar, /messages\.map\(\(message, index\)/);
  assert.doesNotMatch(bar, /messages\.join\("  ·  "\)/);
  assert.match(styles, /dr-beauty-announcement-scroll 32s linear infinite/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?announcement-duplicate[\s\S]*?display: none/);
});

test("discount sharing uses saved active discount data and manual WhatsApp workflow", async () => {
  const [actions, manager, message] = await Promise.all([
    read("../src/app/admin/actions.js"),
    read("../src/components/admin/AdminPromotionsManager.jsx"),
    read("../src/lib/whatsapp/messages.mjs"),
  ]);
  assert.match(actions, /rpc\("save_admin_promotion"/);
  assert.match(actions, /savedPromotion: id \? null : \{ \.\.\.savedPromotion, discount_tiers: promotionTiers \}/);
  assert.match(manager, /if \(result\.savedPromotion\) setSharePromotion\(result\.savedPromotion\)/);
  assert.match(manager, /navigator\.clipboard\.writeText\(shareMessage\)/);
  assert.match(manager, /Copy discount message/);
  assert.match(manager, /href=\{channelUrl\}/);
  assert.match(manager, /Open WhatsApp Channel/);
  assert.match(manager, /paste and publish it yourself/);
  assert.doesNotMatch(manager, /communityInviteUrl|chat\.whatsapp\.com|NEXT_PUBLIC_WHATSAPP_COMMUNITY_INVITE_URL/);
  assert.doesNotMatch(manager, /What this promotion system supports|This system supports percentage and fixed-amount/);
  assert.match(message, /Purpose: Share a Dr\. Beauty promotional offer\.[\s\S]*Code:/);
  const dashboard = await read("../src/app/admin/page.js");
  assert.doesNotMatch(dashboard, /NEXT_PUBLIC_WHATSAPP_COMMUNITY_INVITE_URL|getWhatsAppCommunityInviteUrl/);
});

test("homepage uses a separately validated WhatsApp Channel link, not Click-to-Chat", async () => {
  const [homeCta, whatsappMessages] = await Promise.all([
    read("../src/components/home/NewsletterSection.jsx"),
    read("../src/lib/whatsapp/messages.mjs"),
  ]);
  assert.match(homeCta, /Follow Our WhatsApp Channel/);
  assert.match(homeCta, /getWhatsAppChannelUrl/);
  assert.match(homeCta, /target="_blank"/);
  assert.match(homeCta, /rel="noopener noreferrer"/);
  assert.doesNotMatch(homeCta, /buildWhatsAppClickToChatUrl|chat\.whatsapp\.com|NEXT_PUBLIC_WHATSAPP_COMMUNITY_INVITE_URL/);
  assert.doesNotMatch(whatsappMessages, /getWhatsAppCommunityInviteUrl|NEXT_PUBLIC_WHATSAPP_COMMUNITY_INVITE_URL|chat\.whatsapp\.com/);
});
