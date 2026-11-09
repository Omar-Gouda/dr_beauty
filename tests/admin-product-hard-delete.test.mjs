import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("product deletion server action is admin-guarded, validated, and reports successful deletion", async () => {
  const actions = await source("../src/app/admin/actions.js");
  const action = actions.match(/export async function deleteProduct\(productId\)[\s\S]*?(?=\nexport async function|$)/)?.[0] ?? "";
  assert.match(action, /authorizedClient\(\)/);
  assert.match(action, /if \(!supabase\)[\s\S]*?Admin access is unavailable/);
  assert.match(action, /UUID_PATTERN\.test\(String\(productId/);
  assert.match(action, /rpc\("delete_admin_product", \{ p_product_id: productId \}\)/);
  assert.match(action, /if \(error\)[\s\S]*?error\.code === "42501"/);
  assert.match(action, /error\.code === "23503"/);
  assert.match(action, /error\.code === "P0002"/);
  assert.match(action, /Product permanently deleted/);
  assert.match(action, /revalidatePath\("\/admin\/products"\)/);
  assert.match(action, /revalidatePath\("\/products\/\[slug\]", "page"\)/);
  assert.match(action, /revalidatePath\("\/categories\/\[slug\]", "page"\)/);
  assert.match(action, /logProductDatabaseFailure\("delete", error\)/);
  assert.match(actions, /getSafeProductDatabaseDiagnostic[\s\S]*?message\.replace[\s\S]*?getDevelopmentDatabaseMessage/);
});

test("product UI confirms permanent deletion and refreshes with clear success or failure feedback", async () => {
  const [manager, confirmationDialog, accessibleDialog] = await Promise.all([
    source("../src/components/admin/AdminProductsManager.jsx"),
    source("../src/components/ui/ConfirmationDialog.jsx"),
    source("../src/components/ui/AccessibleDialog.jsx"),
  ]);
  assert.match(manager, /<ConfirmationDialog/);
  assert.equal((manager.match(/onClick=\{\(\) => setProductToDelete\(product\)\}/g) ?? []).length, 2,
    "delete action is available in both the desktop table and mobile card");
  assert.match(manager, /const result = await deleteProduct\(productToDelete\.id\)/);
  assert.match(manager, /showToast\(result\.message, result\.ok \? "success" : "error"\)/);
  assert.match(manager, /if \(result\.ok\) router\.refresh\(\)/);
  assert.match(manager, /Product could not be deleted\. Please refresh and try again\./);
  assert.match(confirmationDialog, /onClick=\{onConfirm\}/);
  assert.match(confirmationDialog, /onClick=\{close\}/);
  assert.match(confirmationDialog, /disabled=\{isPending\}/);
  assert.match(confirmationDialog, /labelledBy=\{titleId\} describedBy=\{descriptionId\}/);
  assert.match(accessibleDialog, /aria-labelledby=\{labelledBy\}/);
  assert.match(accessibleDialog, /aria-describedby=\{describedBy\}/);
});

test("migration detaches only restrictive historical product FKs and retains their rows", async () => {
  const [migration, schema, retention, lifecycle] = await Promise.all([
    source("../supabase/migrations/20261123000000_admin_product_hard_delete.sql"),
    source("../supabase/migrations/20261021000000_initial_schema.sql"),
    source("../supabase/migrations/20261120000000_order_retention_deletion_redemption_ledger.sql"),
    source("../supabase/migrations/20261027000000_order_lifecycle.sql"),
  ]);
  assert.match(schema, /product_id uuid not null references public\.products \(id\) on delete restrict/i);
  assert.match(migration, /alter table public\.order_items[\s\S]*?alter column product_id drop not null[\s\S]*?drop constraint order_items_product_id_fkey[\s\S]*?foreign key \(product_id\) references public\.products \(id\) on delete set null/i);
  assert.match(migration, /alter table public\.product_reviews[\s\S]*?alter column product_id drop not null[\s\S]*?drop constraint product_reviews_product_id_fkey[\s\S]*?foreign key \(product_id\) references public\.products \(id\) on delete set null/i);
  assert.match(lifecycle, /create table private\.order_inventory_restorations[\s\S]*?product_id uuid not null references public\.products \(id\) on delete restrict/i);
  assert.match(migration, /alter table private\.order_inventory_restorations\s+drop constraint order_inventory_restorations_product_id_fkey/i);
  assert.match(migration, /historical product uuid[\s\S]*?retained after product deletion/i);
  const transition = migration.match(/create or replace function public\.transition_cod_order_status[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(transition, /security definer\s+set search_path = ''/i);
  assert.match(transition, /v_actor_id is null[\s\S]*?not coalesce\(private\.is_admin\(\), false\)/i);
  assert.match(transition, /if v_item\.product_id is null then[\s\S]*?continue;/);
  const itemTrigger = retention.match(/create or replace function private\.prevent_order_item_mutation[\s\S]*?\$\$;/i)?.[0] ?? "";
  assert.match(itemTrigger, /tg_op = 'UPDATE'[\s\S]*?pg_catalog\.pg_trigger_depth\(\) > 1[\s\S]*?old\.product_id is not null[\s\S]*?new\.product_id is null/);
  for (const snapshot of ["product_name_snapshot", "product_slug_snapshot", "unit_price", "quantity", "line_total"]) {
    assert.match(itemTrigger, new RegExp(snapshot, "i"));
  }
  assert.match(retention, /foreign key \(product_id\) references public\.products \(id\) on delete set null/i,
    "promotion redemption product references remain preserved by their existing SET NULL behavior");
  assert.match(migration, /^begin;/);
  assert.match(migration.trimEnd(), /commit;$/);
});

test("inventory, image, and wishlist cascades and nullable service/redemption references remain unchanged", async () => {
  const [schema, requests, retention, migration] = await Promise.all([
    source("../supabase/migrations/20261021000000_initial_schema.sql"),
    source("../supabase/migrations/20261103000000_customer_service_requests.sql"),
    source("../supabase/migrations/20261120000000_order_retention_deletion_redemption_ledger.sql"),
    source("../supabase/migrations/20261123000000_admin_product_hard_delete.sql"),
  ]);
  assert.match(schema, /product_inventory[\s\S]*?references public\.products \(id\) on delete cascade/i);
  assert.match(schema, /product_images[\s\S]*?references public\.products \(id\) on delete cascade/i);
  assert.match(schema, /wishlist_items[\s\S]*?references public\.products \(id\) on delete cascade/i);
  assert.match(requests, /product_id uuid references public\.products \(id\) on delete set null/i);
  assert.match(retention, /foreign key \(product_id\) references public\.products \(id\) on delete set null/i);
  assert.match(retention, /create table private\.promotion_redemptions[\s\S]*?order_id uuid unique references public\.orders \(id\) on delete set null/i);
  assert.doesNotMatch(migration, /drop constraint (?:order_items_order_id_fkey|product_reviews_user_id_fkey|customer_service_requests_product_id_fkey)/i);
  assert.doesNotMatch(migration, /promotion_redemptions/i);
  assert.doesNotMatch(migration, /delete from (?:public\.)?(?:orders|order_items|product_reviews|customer_service_requests)/i);
});

test("permanent product delete migration exposes only the admin-authorized atomic RPC", async () => {
  const migration = await source("../supabase/migrations/20261125000000_admin_product_delete_rpc.sql");
  assert.match(migration, /create function public\.delete_admin_product\(p_product_id uuid\)[\s\S]*?security definer\s+set search_path = ''/i);
  assert.match(migration, /auth\.uid\(\)[\s\S]*?private\.is_admin\(\)/i);
  assert.match(migration, /delete from public\.products[\s\S]*?returning product\.id into v_deleted_product_id/i);
  assert.match(migration, /revoke all on function public\.delete_admin_product\(uuid\) from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.delete_admin_product\(uuid\) to authenticated/i);
  assert.doesNotMatch(migration, /delete from public\.(?:orders|order_items|product_reviews|customer_service_requests|promotion_redemptions)/i);
});

test("existing product create, edit, activation, and deactivation paths remain available", async () => {
  const actions = await source("../src/app/admin/actions.js");
  const manager = await source("../src/components/admin/AdminProductsManager.jsx");
  const saveAction = actions.split("export async function saveProduct(input) {")[1]?.split("\nexport async function setProductActive")[0] ?? "";
  assert.match(saveAction, /rpc\("save_admin_product_with_image_focal_points"/);
  assert.match(actions, /export async function setProductActive\(productId, isActive\)/);
  assert.match(manager, /onClick=\{\(\) => changeActive\(product\)\}/);
  assert.match(manager, /setProductActive\(product\.id, !product\.is_active\)/);
});
