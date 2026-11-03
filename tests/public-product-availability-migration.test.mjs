import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL(
  "../supabase/migrations/20261108000000_public_product_availability.sql",
  import.meta.url,
);
const schemaPath = new URL("../supabase/migrations/20261021000000_initial_schema.sql", import.meta.url);
const orderCreationPath = new URL("../supabase/migrations/20261023000000_cod_order_creation.sql", import.meta.url);

test("public availability exposes only active product IDs and boolean stock state", async () => {
  const [migration, schema] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(schemaPath, "utf8"),
  ]);
  const fn = migration.match(/create function public\.get_public_product_availability\([\s\S]*?\n\$\$;/i)?.[0];

  assert.ok(fn, "expected public availability function");
  assert.match(fn, /returns table\s*\(\s*product_id uuid,\s*is_available boolean\s*\)/i);
  assert.match(fn, /security definer/i);
  assert.match(fn, /set search_path\s*=\s*''/i);
  assert.match(fn, /from public\.products as product_row/i);
  assert.match(fn, /left join public\.product_inventory as inventory/i);
  assert.match(fn, /where product_row\.is_active/i);
  assert.match(fn, /coalesce\(inventory\.stock_quantity\s*>\s*0,\s*false\)/i);
  assert.match(fn, /cardinality\(p_product_ids\)\s*>\s*1000/i);
  assert.match(fn, /array_position\(p_product_ids, null\)/i);
  assert.doesNotMatch(fn, /stock_quantity\s*[,)]/i);

  assert.match(schema, /create table public\.product_inventory\s*\([\s\S]*?product_id uuid primary key/i);
  assert.match(schema, /create policy product_inventory_admin_manage on public\.product_inventory[\s\S]*?for all to authenticated[\s\S]*?private\.is_admin\(\)/i);
  assert.match(migration, /revoke all on function public\.get_public_product_availability\(uuid\[\]\)\s+from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant execute on function public\.get_public_product_availability\(uuid\[\]\)\s+to anon, authenticated/i);
});

test("order creation remains the locked inventory reservation authority", async () => {
  const migration = await readFile(orderCreationPath, "utf8");
  assert.match(migration, /for update of p, inventory/i);
  assert.match(migration, /if v_line\.stock_quantity < v_line\.quantity then/i);
  assert.match(migration, /set stock_quantity = inventory\.stock_quantity - v_line\.quantity/i);
  assert.match(migration, /and inventory\.stock_quantity >= v_line\.quantity/i);
});
