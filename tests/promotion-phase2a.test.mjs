import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateEligiblePromotionAmounts, calculateEligiblePromotionDiscountCents } from "../src/lib/promotion-targeting.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

const products = [
  { id: "product-a", category_id: "category-a", price: "12.00" },
  { id: "product-b", category_id: "category-b", price: "8.00" },
  { id: "product-c", category_id: "category-a", price: "5.00" },
];
const items = [
  { product_id: "product-a", quantity: 2 },
  { product_id: "product-b", quantity: 1 },
  { product_id: "product-c", quantity: 1 },
];

test("product, category, mixed OR targeting calculates the eligible subtotal once per product", () => {
  const productOnly = calculateEligiblePromotionAmounts({ items, products, scope: "products", productTargetIds: ["product-a"] });
  assert.deepEqual(productOnly, { subtotalCents: 3700, eligibleSubtotalCents: 2400 });

  const categoryOnly = calculateEligiblePromotionAmounts({ items, products, scope: "categories", categoryTargetIds: ["category-b"] });
  assert.deepEqual(categoryOnly, { subtotalCents: 3700, eligibleSubtotalCents: 800 });

  const mixed = calculateEligiblePromotionAmounts({
    items,
    products,
    scope: "product_and_category",
    productTargetIds: ["product-a"],
    categoryTargetIds: ["category-a"],
  });
  assert.deepEqual(mixed, { subtotalCents: 3700, eligibleSubtotalCents: 2900 });
});

test("order scope preserves whole-order behavior and unmatched targets fail closed", () => {
  assert.deepEqual(calculateEligiblePromotionAmounts({ items, products, scope: "order" }), {
    subtotalCents: 3700,
    eligibleSubtotalCents: 3700,
  });
  const unmatched = calculateEligiblePromotionAmounts({
    items,
    products,
    scope: "products",
    productTargetIds: ["not-in-cart"],
  });
  assert.equal(unmatched.eligibleSubtotalCents, 0);
  assert.equal(calculateEligiblePromotionDiscountCents(unmatched, {
    discount_type: "fixed_amount",
    discount_value: "5.00",
    minimum_subtotal: "0.00",
  }), null);
});

test("minimum eligible subtotal, fixed amounts, percentage caps, and subtotal caps are honored", () => {
  const amounts = calculateEligiblePromotionAmounts({
    items,
    products,
    scope: "categories",
    categoryTargetIds: ["category-a"],
  });
  assert.equal(amounts.eligibleSubtotalCents, 2900);
  assert.equal(calculateEligiblePromotionDiscountCents(amounts, {
    discount_type: "fixed_amount", discount_value: "40.00", minimum_subtotal: "30.00",
  }), null);
  assert.equal(calculateEligiblePromotionDiscountCents(amounts, {
    discount_type: "fixed_amount", discount_value: "40.00", minimum_subtotal: "20.00",
  }), 2900);
  assert.equal(calculateEligiblePromotionDiscountCents(amounts, {
    discount_type: "percentage", discount_value: "50.00", maximum_discount: "10.00", minimum_subtotal: "20.00",
  }), 1000);
});

test("authoritative checkout serializes all first-purchase candidates and recalculates database prices", async () => {
  const migration = await read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql");
  const checkout = migration.match(/create or replace function public\.create_cod_order\([\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(checkout, /pg_advisory_xact_lock\([\s\S]*?promotion-first-purchase/);
  assert.match(checkout, /private\.account_first_purchase_reservations[\s\S]*?private\.first_purchase_order_candidates/);
  assert.match(checkout, /An earlier order is reserving first-purchase eligibility/);
  assert.match(checkout, /promotion\.application_scope = 'product_and_category'[\s\S]*?or exists/);
  assert.match(checkout, /sum\(product\.price \* requested\.quantity\)/);
  assert.match(checkout, /v_discount := pg_catalog\.round\(v_eligible_subtotal/);
  assert.match(checkout, /v_discount := least\(v_discount, v_eligible_subtotal\)/);
  assert.doesNotMatch(checkout, /p_items[\s\S]{0,100}price numeric/);
  assert.doesNotMatch(migration, /update public\.order_items|delete from public\.order_items/i);
});

test("reservation state model covers ordinary and promotional orders in either arrival order", () => {
  const state = { purchase: false, candidates: [] };
  const create = (order, kind) => {
    if (state.purchase || state.candidates.length > 0) return false;
    state.candidates.push({ ...order, kind });
    return true;
  };
  assert.equal(create({ id: "ordinary" }, "ordinary"), true);
  assert.equal(create({ id: "discounted" }, "first-purchase-promo"), false);

  state.candidates = [];
  assert.equal(create({ id: "discounted" }, "first-purchase-promo"), true);
  assert.equal(create({ id: "ordinary" }, "ordinary"), false);
  assert.equal(state.candidates.length, 1);
});

test("lifecycle model keeps delivered pending claims, releases definitive failures, and records paid delivery permanently", () => {
  const state = { candidates: new Set(["order-1"]), purchase: false };
  const transition = (order) => {
    if (order.order_status === "delivered" && ["paid", "refunded"].includes(order.payment_status)) {
      state.purchase = true;
      state.candidates.clear();
    } else if (order.order_status === "cancelled" || order.payment_status === "failed") {
      state.candidates.delete(order.id);
    }
  };
  transition({ id: "order-1", order_status: "delivered", payment_status: "pending" });
  assert.equal(state.candidates.has("order-1"), true);
  assert.equal(state.purchase, false);
  transition({ id: "order-1", order_status: "delivered", payment_status: "paid" });
  assert.equal(state.purchase, true);
  assert.equal(state.candidates.size, 0);
  // Retention detaches the order reference; it cannot clear this marker.
  assert.equal(state.purchase, true);

  state.purchase = false;
  state.candidates.add("order-2");
  transition({ id: "order-2", order_status: "cancelled", payment_status: "pending" });
  assert.equal(state.candidates.has("order-2"), false);
  state.candidates.add("order-3");
  transition({ id: "order-3", order_status: "delivered", payment_status: "failed" });
  assert.equal(state.candidates.has("order-3"), false);
});

test("first-purchase status rules retain collectible pending reservations and preserve history", async () => {
  const migration = await read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql");
  const qualifies = (order) => order.order_status === "delivered" && ["paid", "refunded"].includes(order.payment_status);
  const releasesReservation = (order) => order.order_status === "cancelled" || order.payment_status === "failed";
  assert.equal(qualifies({ order_status: "pending_confirmation", payment_status: "pending" }), false);
  assert.equal(qualifies({ order_status: "cancelled", payment_status: "paid" }), false);
  assert.equal(qualifies({ order_status: "shipped", payment_status: "pending" }), false);
  assert.equal(qualifies({ order_status: "delivered", payment_status: "pending" }), false);
  assert.equal(qualifies({ order_status: "delivered", payment_status: "paid" }), true);
  assert.equal(qualifies({ order_status: "delivered", payment_status: "refunded" }), true);
  assert.equal(releasesReservation({ order_status: "delivered", payment_status: "pending" }), false);
  assert.equal(releasesReservation({ order_status: "delivered", payment_status: "failed" }), true);
  assert.equal(releasesReservation({ order_status: "cancelled", payment_status: "pending" }), true);

  const lifecycle = migration.match(/create function private\.update_first_purchase_state_from_order\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(lifecycle, /new\.order_status = 'delivered' and new\.payment_status in \('paid', 'refunded'\)/);
  assert.match(lifecycle, /new\.order_status = 'cancelled' or new\.payment_status = 'failed'/);
  assert.doesNotMatch(lifecycle, /new\.order_status = 'delivered' and new\.payment_status not in/);
  assert.match(migration, /order_row\.order_status = 'delivered'[\s\S]*?order_row\.payment_status in \('paid', 'refunded'\)/);
  assert.match(migration, /redemption\.status in \('redeemed', 'refunded'\)/);
  assert.match(migration, /first_order_id uuid unique references public\.orders \(id\) on delete set null/);
  assert.match(migration, /order_id uuid primary key references public\.orders \(id\) on delete cascade/);
  assert.match(migration, /insert into private\.first_purchase_order_candidates \(account_id, order_id\)[\s\S]*?on conflict \(order_id\) do nothing/);
  assert.match(migration, /order_row\.order_status in \('pending_confirmation', 'confirmed', 'processing', 'shipped'\)[\s\S]*?order_row\.payment_status in \('pending', 'paid', 'refunded'\)/);
  assert.match(migration, /order_row\.order_status = 'delivered' and order_row\.payment_status = 'pending'/);
  assert.match(migration, /pg_catalog\.count\(\*\) > 1/);
  assert.match(migration, /is_ambiguous boolean not null/);
  assert.match(migration, /delete from private\.first_purchase_order_candidates as candidate[\s\S]*?where candidate\.account_id = new\.user_id/);
  assert.doesNotMatch(migration, /first_purchase_promotion_claims/);
});

test("COD collection serializes before order locking and permanently marks a paid delivery", async () => {
  const [migration, paymentMigration] = await Promise.all([
    read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql"),
    read("../supabase/migrations/20261106000000_admin_order_history_and_cod_collection.sql"),
  ]);
  const paymentWrapper = migration.match(/create function public\.mark_cod_order_paid\([\s\S]*?\$\$;/)?.[0] ?? "";
  const paymentImplementation = paymentMigration.match(/create function public\.mark_cod_order_paid\([\s\S]*?\$\$;/)?.[0] ?? "";
  const stateTrigger = migration.match(/create function private\.update_first_purchase_state_from_order\(\)[\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(paymentWrapper, /pg_advisory_xact_lock[\s\S]*?promotion-first-purchase[\s\S]*?private\.mark_cod_order_paid_unlocked/);
  assert.match(paymentImplementation, /if v_payment_status = 'pending'[\s\S]*?set payment_status = 'paid'[\s\S]*?requires reconciliation/);
  assert.match(migration, /alter function public\.mark_cod_order_paid\(uuid\) set schema private/);
  assert.match(migration, /revoke all on function private\.mark_cod_order_paid_unlocked\(uuid\)[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(stateTrigger, /insert into private\.account_first_purchases[\s\S]*?on conflict \(account_id\) do nothing/);
  assert.match(stateTrigger, /delete from private\.first_purchase_order_candidates as candidate[\s\S]*?where candidate\.account_id = new\.user_id/);
  assert.match(stateTrigger, /first_purchase_account_lock_is_held\(new\.user_id\)/);
  assert.doesNotMatch(stateTrigger, /pg_advisory_xact_lock/);
  const lockGuard = migration.match(/create function private\.first_purchase_account_lock_is_held\([\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(lockGuard, /pg_catalog\.pg_locks/);
  assert.match(lockGuard, /pg_catalog\.hashtextextended\([\s\S]*?:promotion-first-purchase/);
  assert.match(lockGuard, /lock_row\.classid[\s\S]*?lock_row\.objid[\s\S]*?lock_row\.objsubid = 1/);
});

test("checkout, lifecycle, manual deletion, payment, and retention use one account lock before row locks", async () => {
  const migration = await read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql");
  const checkout = migration.match(/create or replace function public\.create_cod_order\([\s\S]*?\$\$;/)?.[0] ?? "";
  const transitionWrapper = migration.match(/create function public\.transition_cod_order_status\([\s\S]*?\$\$;/)?.[0] ?? "";
  const transitionSource = await read("../supabase/migrations/20261123000000_admin_product_hard_delete.sql");
  const internalTransition = transitionSource.match(/create or replace function public\.transition_cod_order_status\([\s\S]*?\$\$;/)?.[0] ?? "";

  const paymentWrapper = migration.match(/create function public\.mark_cod_order_paid\([\s\S]*?\$\$;/)?.[0] ?? "";
  const deleteWrapper = migration.match(/create or replace function public\.delete_admin_order\([\s\S]*?\$\$;/)?.[0] ?? "";
  const retention = migration.match(/create or replace function private\.run_order_retention_cleanup\([\s\S]*?\$\$;/)?.[0] ?? "";
  const lockExpression = /pg_catalog\.hashtextextended\((?:v_user_id|v_account_id|v_candidate\.user_id|new\.user_id|p_account_id)::text \|\| ':promotion-first-purchase', 0\)/;
  assert.match(checkout, lockExpression);
  assert.match(transitionWrapper, lockExpression);
  assert.match(paymentWrapper, lockExpression);
  assert.match(deleteWrapper, lockExpression);
  assert.match(retention, lockExpression);
  assert.ok(checkout.indexOf("promotion-first-purchase") < checkout.indexOf("for update of p, inventory"));
  assert.ok(transitionWrapper.indexOf("promotion-first-purchase") < transitionWrapper.indexOf("private.transition_cod_order_status_unlocked"));
  assert.ok(paymentWrapper.indexOf("promotion-first-purchase") < paymentWrapper.indexOf("private.mark_cod_order_paid_unlocked"));
  assert.ok(deleteWrapper.indexOf("promotion-first-purchase") < deleteWrapper.indexOf("for update;"));
  assert.ok(retention.indexOf("promotion-first-purchase") < retention.indexOf("for update of order_row skip locked"));
  assert.match(retention, /order by order_row\.user_id nulls first,[\s\S]*?order_row\.retention_started_at/);
  assert.ok(checkout.indexOf("promotion-first-purchase") < checkout.indexOf("for update of p, inventory"));
  assert.ok(checkout.indexOf("promotion-first-purchase") < checkout.indexOf("for share;"));
  assert.match(migration, /alter function public\.transition_cod_order_status\(uuid, text, text, text, text\)[\s\S]*?set schema private/);
  assert.match(migration, /revoke all on function private\.transition_cod_order_status_unlocked[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(internalTransition, /order by oi\.product_id[\s\S]*?for update/);
  assert.match(internalTransition, /update public\.product_inventory as inventory[\s\S]*?insert into private\.order_inventory_restorations/);
  assert.match(internalTransition, /if v_item\.product_id is null then[\s\S]*?continue/);
});

test("DDL locks follow documented FK and checkout order and require drained traffic", async () => {
  const migration = await read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql");
  const lockStatements = [...migration.matchAll(/lock table ([\w.]+) in ([\w ]+) mode;/g)].map((match) => `${match[1]}:${match[2].trim()}`);
  assert.deepEqual(lockStatements, [
    "public.categories:share row exclusive",
    "public.products:share row exclusive",
    "auth.users:share row exclusive",
    "public.promotions:access exclusive",
    "public.orders:share row exclusive",
  ]);
  assert.match(migration, /Pause checkout, order[\s\S]*?drain their in-flight transactions before starting/);
  assert.ok(migration.indexOf("lock table public.promotions") < migration.indexOf("lock table public.orders"));
});

test("orders reserve the account before promotion checks and reject both forms of competing order", async () => {
  const migration = await read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql");
  const checkout = migration.match(/create or replace function public\.create_cod_order\([\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(checkout, /hashtextextended\(v_user_id::text \|\| ':promotion-first-purchase', 0\)/);
  assert.ok(checkout.indexOf("promotion-first-purchase") < checkout.indexOf("select promotion.* into v_promotion"));
  assert.match(checkout, /An earlier order is reserving first-purchase eligibility/);
  const insertGuard = migration.match(/create function private\.enforce_first_purchase_reservation_on_order_insert\([\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(insertGuard, /new\.promotion_id is not null[\s\S]*?promotion\.first_purchase_only/);
  assert.match(insertGuard, /private\.account_first_purchase_reservations[\s\S]*?private\.first_purchase_order_candidates/);
  assert.match(migration, /create trigger orders_enforce_first_purchase_reservation[\s\S]*?before insert on public\.orders/);
  assert.match(migration, /create trigger orders_record_first_purchase_candidate[\s\S]*?after insert on public\.orders/);
});

test("legacy ambiguous accounts fail closed and permanent markers survive order deletion", async () => {
  const migration = await read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql");
  assert.match(migration, /case when pg_catalog\.count\(\*\) = 1[\s\S]*?else null[\s\S]*?pg_catalog\.count\(\*\) > 1/);
  assert.match(migration, /check \([\s\S]*?is_ambiguous and reservation_order_id is null[\s\S]*?not is_ambiguous and reservation_order_id is not null/);
  assert.match(migration, /first_order_id uuid unique references public\.orders \(id\) on delete set null/);
  assert.match(migration, /create trigger first_purchase_candidates_refresh_reservation[\s\S]*?after insert or delete/);
  assert.match(migration, /if not exists \(select 1 from auth\.users[\s\S]*?account_first_purchases/);
});

test("lifecycle wrapper ownership follows the original implementation owner", async () => {
  const migration = await read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql");
  assert.doesNotMatch(migration, /alter function (?:private\.(?:transition_cod_order_status_unlocked|mark_cod_order_paid_unlocked)|public\.(?:transition_cod_order_status|mark_cod_order_paid))\([^\n]*\) owner to postgres/);
  assert.match(migration, /pg_get_userbyid\(function_row\.proowner\)/);
  assert.match(migration, /Original transition_cod_order_status owner lacks required private USAGE or public CREATE privilege/);
  assert.match(migration, /Original mark_cod_order_paid owner lacks required private USAGE or public CREATE privilege/);
  assert.match(migration, /revoke all on function private\.transition_cod_order_status_unlocked[\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /revoke all on function private\.mark_cod_order_paid_unlocked[\s\S]*?from public, anon, authenticated, service_role/);
});

test("checkout preview uses advisory eligibility and database-backed target identifiers", async () => {
  const [actions, migration] = await Promise.all([
    read("../src/app/(checkout)/checkout/actions.js"),
    read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql"),
  ]);
  assert.match(actions, /select\("id,price,category_id"\)/);
  assert.match(actions, /rpc\([\s\S]*?get_promotion_preview_eligibility/);
  assert.match(actions, /eligibility\.first_purchase_eligible/);
  assert.match(actions, /calculateEligiblePromotionAmounts/);
  assert.match(actions, /finalCheckRequired: true/);
  assert.match(migration, /grant execute on function public\.get_promotion_preview_eligibility\(uuid\) to authenticated/);
  assert.match(migration, /revoke all on function public\.get_promotion_preview_eligibility\(uuid\)[\s\S]*?from public, anon, authenticated, service_role/);
});

test("admin promotion saves are atomic, authorized, target-validated, and RLS-protected", async () => {
  const [migration, actions, manager, data] = await Promise.all([
    read("../supabase/migrations/20261130000000_phase2a_first_purchase_promotion_targeting.sql"),
    read("../src/app/admin/actions.js"),
    read("../src/components/admin/AdminPromotionsManager.jsx"),
    read("../src/lib/admin.js"),
  ]);
  assert.match(migration, /promotion_product_targets.*?references public\.products \(id\) on delete cascade/s);
  assert.match(migration, /promotion_category_targets.*?references public\.categories \(id\) on delete cascade/s);
  assert.match(migration, /alter table public\.promotion_product_targets enable row level security/);
  assert.match(migration, /grant select on table public\.promotion_product_targets,[\s\S]*?public\.promotion_category_targets to authenticated/);
  assert.match(migration, /promotion_product_targets_admin_read[\s\S]*?for select to authenticated[\s\S]*?using \(\(select private\.is_admin\(\)\)\)/);
  assert.match(migration, /auth\.uid\(\) is null or not coalesce\(private\.is_admin\(\), false\)/);
  assert.match(migration, /grant execute on function public\.save_admin_promotion\(jsonb, uuid\[\], uuid\[\]\) to authenticated/);
  assert.match(actions, /rpc\("save_admin_promotion"/);
  assert.match(actions, /applicationScope === "product_and_category"/);
  assert.match(manager, /First purchase only/);
  assert.match(manager, /Target products/);
  assert.match(manager, /Target categories/);
  assert.match(data, /promotion_product_targets/);
  assert.match(data, /promotion_category_targets/);
});
