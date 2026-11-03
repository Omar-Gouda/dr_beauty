import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("promotion management uses the existing admin check and schema-backed fields", async () => {
  const [actions, schema, sidebar, page, manager] = await Promise.all([
    readFile(new URL("../src/app/admin/actions.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20261021000000_initial_schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/components/admin/AdminSidebar.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/admin/promotions/page.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/admin/AdminPromotionsManager.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(actions, /export async function savePromotion/);
  assert.match(actions, /export async function setPromotionActive/);
  assert.match(actions, /const supabase = await authorizedClient\(\)/);
  assert.match(actions, /from\("promotions"\)/);
  assert.match(actions, /revalidatePath\("\/admin\/promotions"\)/);
  assert.match(schema, /create policy promotions_admin_manage[\s\S]*?private\.is_admin\(\)/);
  assert.match(schema, /create unique index promotions_code_lower_uidx on public\.promotions \(lower\(code\)\)/);
  assert.match(sidebar, /href: "\/admin\/promotions"/);
  assert.match(page, /getAdminPromotions/);
  assert.match(manager, /@\/components\/ui\/Select/);
  assert.doesNotMatch(manager, /<select\b/i);
});

test("featured offers use the public eligibility projection and local storefront destinations", async () => {
  const [banner, catalog, migration] = await Promise.all([
    readFile(new URL("../src/components/home/PromotionalBanner.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/catalog.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20261109000000_shipping_configuration_featured_promotions_and_reviews.sql", import.meta.url), "utf8"),
  ]);
  const eligibilityMigration = await readFile(
    new URL("../supabase/migrations/20261115000000_public_redeemable_featured_promotions.sql", import.meta.url),
    "utf8",
  );
  assert.match(catalog, /rpc\("get_public_featured_promotions"/);
  assert.match(eligibilityMigration, /promotion\.is_featured\s+and promotion\.is_active/);
  assert.match(eligibilityMigration, /promotion\.target_path/);
  assert.match(banner, /if \(promotions\.length === 0\) return null/);
  assert.match(migration, /promotions_featured_title_check/);
  assert.match(migration, /target_path ~ '\^\//);
});
