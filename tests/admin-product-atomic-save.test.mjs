import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const actionSource = await readFile(new URL("../src/app/admin/actions.js", import.meta.url), "utf8");
const migration = await readFile(
  new URL("../supabase/migrations/20261114000000_atomic_admin_product_save.sql", import.meta.url),
  "utf8",
);
const comparePriceMigration = await readFile(
  new URL("../supabase/migrations/20261116000000_atomic_product_compare_at_price.sql", import.meta.url),
  "utf8",
);
const saveProductAction = actionSource.split("export async function saveProduct(input) {")[1]
  ?.split("\nexport async function setProductActive")[0];
const saveFunction = migration.split("as $$")[1]?.split("$$;")[0];
const comparePriceFunction = comparePriceMigration.split("as $$")[1]?.split("$$;")[0];

test("product creation and editing use one atomic save RPC", () => {
  assert.ok(saveProductAction);
  assert.match(saveProductAction, /supabase\.rpc\("save_admin_product_with_image_focal_points"/);
  assert.doesNotMatch(saveProductAction, /\.from\("(?:brands|products|product_inventory|product_images)"\)/);
  assert.match(saveProductAction, /p_product_id: id/);
  assert.match(saveProductAction, /p_is_active: input\.isActive === true/);
  assert.match(saveProductAction, /p_is_bestseller: input\.isBestseller === true/);
  assert.match(saveProductAction, /p_compare_at_price: pricing\.compareAtPrice/);
  assert.match(saveProductAction, /p_image_urls: images\.map\(\(image\) => image\.url\)/);
  assert.match(saveProductAction, /p_image_focal_points: images\.map/);
});

test("the RPC is admin-authorized and unavailable to public execution roles", () => {
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(saveFunction, /v_user_id is null or not private\.is_admin\(\)/);
  assert.match(migration, /revoke all on function public\.save_admin_product\([\s\S]*?\) from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.save_admin_product\([\s\S]*?\) to authenticated/i);
});

test("the compare-at wrapper validates and persists pricing in the same authorized call", () => {
  assert.match(comparePriceMigration, /security definer\s+set search_path = ''/i);
  assert.match(comparePriceFunction, /v_user_id is null or not private\.is_admin\(\)/);
  assert.match(comparePriceFunction, /p_compare_at_price <= p_price/);
  assert.ok(comparePriceFunction.indexOf("set compare_at_price = null") < comparePriceFunction.indexOf("public.save_admin_product("));
  assert.match(comparePriceFunction, /public\.save_admin_product\(/);
  assert.match(comparePriceFunction, /update public\.products as product\s+set compare_at_price = p_compare_at_price/);
  assert.match(comparePriceMigration, /revoke all on function public\.save_admin_product_with_compare_at\([\s\S]*?\) from public, anon, authenticated, service_role/i);
  assert.match(comparePriceMigration, /grant execute on function public\.save_admin_product_with_compare_at\([\s\S]*?\) to authenticated/i);
  assert.doesNotMatch(comparePriceMigration, /alter table|create policy|drop policy|grant .* on table|revoke .* on table/i);
});

test("the RPC validates category and image references before changing rows", () => {
  const validationEnd = saveFunction.indexOf("-- Serialize same-name brand creation");
  const firstWrite = saveFunction.indexOf("insert into public.brands");
  assert.ok(validationEnd > 0 && firstWrite > validationEnd);
  assert.match(saveFunction, /for key share/);
  assert.match(saveFunction, /v_image ~\* '\^\/images/);
  assert.match(saveFunction, /p_image_urls is null[\s\S]*?cardinality\(p_image_urls\) not between 1 and 10/);
});

test("brand, product, inventory, image replacement, and activation are in one RPC body", () => {
  for (const fragment of [
    "insert into public.brands",
    "insert into public.products",
    "update public.products as product",
    "update public.product_inventory as inventory",
    "delete from public.product_images as image",
    "insert into public.product_images",
  ]) assert.ok(saveFunction.includes(fragment), `missing ${fragment}`);
  assert.match(saveFunction, /with ordinality/);
  assert.match(saveFunction, /image\.ordinality - 1/);
  assert.match(saveFunction, /if p_is_active then/);
  assert.match(saveFunction, /raise exception[\s\S]*?inventory could not be saved/);
});

test("editing retains the supplied product ID and failures are not reported as success", () => {
  assert.match(saveFunction, /where product\.id = p_product_id/);
  assert.match(saveFunction, /if not found then[\s\S]*?The product to edit was not found/);
  assert.match(saveProductAction, /if \(error \|\| typeof data !== "string" \|\| !UUID_PATTERN\.test\(data\)\)/);
  assert.match(saveProductAction, /catch \(caughtError\)/);
  assert.match(saveProductAction, /logProductDatabaseFailure\("save", caughtError\)/);
  assert.match(saveProductAction, /revalidatePath\("\/admin\/products"\)/);
});

test("migration changes only the new RPC privilege surface, not table grants or policies", () => {
  assert.match(migration, /^begin;/);
  assert.match(migration.trimEnd(), /commit;$/);
  assert.doesNotMatch(migration, /alter table|create policy|drop policy|grant .* on table|revoke .* on table/i);
  assert.doesNotMatch(migration, /delete from public\.products|delete from public\.brands/);
});
