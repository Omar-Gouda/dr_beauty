import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getProductPricing, validateProductPricing } from "../src/lib/products/pricing.mjs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("products without a compare-at price use the selling price", () => {
  assert.deepEqual(validateProductPricing("100", ""), {
    ok: true,
    price: "100",
    compareAtPrice: null,
  });
  assert.deepEqual(getProductPricing("100", null), {
    price: 100,
    compareAtPrice: null,
    hasCompareAtPrice: false,
  });
});

test("a higher compare-at price is preserved separately from the payable price", () => {
  const input = validateProductPricing("80.00", "100.00");
  assert.deepEqual(input, { ok: true, price: "80.00", compareAtPrice: "100.00" });
  assert.deepEqual(getProductPricing(input.price, input.compareAtPrice), {
    price: 80,
    compareAtPrice: 100,
    hasCompareAtPrice: true,
  });
});

test("equal, lower, zero, malformed, and over-precision compare-at prices are rejected", () => {
  for (const value of ["100", "99.99", "0", "abc", "100.001", "10000000000.00"]) {
    assert.equal(validateProductPricing("100", value).ok, false, `accepted ${value}`);
  }
});

test("the server action and atomic save wrapper preserve compare-at values on create and edit", async () => {
  const [action, form, adminQuery, migration] = await Promise.all([
    read("../src/app/admin/actions.js"),
    read("../src/components/admin/AddProductForm.jsx"),
    read("../src/lib/admin.js"),
    read("../supabase/migrations/20261116000000_atomic_product_compare_at_price.sql"),
  ]);
  assert.match(form, /name="compareAtPrice"/);
  assert.match(form, /defaultValue=\{product\?\.compareAtPrice \?\? ""\}/);
  assert.match(action, /validateProductPricing\(input\.price, input\.compareAtPrice\)/);
  assert.match(action, /p_compare_at_price: pricing\.compareAtPrice/);
  assert.match(adminQuery, /price,compare_at_price/);
  assert.match(migration, /set compare_at_price = p_compare_at_price/);
  assert.match(migration, /public\.save_admin_product\(/);
});

test("catalog and cart use products.price as payable while retaining compare-at display data", async () => {
  const [catalog, cart, card, detail, featured, cartItem] = await Promise.all([
    read("../src/lib/catalog.js"),
    read("../src/constants/CartContext.js"),
    read("../src/components/products/ProductCard.jsx"),
    read("../src/components/products/ProductDetail.jsx"),
    read("../src/components/home/FeaturedProducts.jsx"),
    read("../src/components/cart/CartItem.jsx"),
  ]);
  assert.match(catalog, /"price",\s*"compare_at_price"/);
  assert.match(catalog, /price: Number\(row\.price\)/);
  assert.match(catalog, /compareAtPrice: row\.compare_at_price == null \? null : Number\(row\.compare_at_price\)/);
  assert.match(cart, /price: pricing\.price/);
  assert.match(cart, /item\.price \* item\.quantity/);
  for (const component of [card, detail, featured, cartItem]) {
    assert.match(component, /<ProductPrice/);
    assert.match(component, /compareAtPrice=\{(?:product|item)\.compareAtPrice\}/);
  }
});

test("checkout and order snapshots charge the database selling price; promotion discounts stay separate", async () => {
  const [checkoutAction, orderRpc] = await Promise.all([
    read("../src/app/(checkout)/checkout/actions.js"),
    read("../supabase/migrations/20261112000000_checkout_discount_least_expression_fix.sql"),
  ]);
  assert.match(checkoutAction, /select\("id,price"\)/);
  assert.match(checkoutAction, /p_items: items/);
  assert.doesNotMatch(checkoutAction, /p_price|compareAtPrice/);
  assert.match(orderRpc, /p\.price as unit_price/);
  assert.match(orderRpc, /v_subtotal := v_subtotal \+ v_line\.unit_price \* v_line\.quantity/);
  assert.match(orderRpc, /discount_amount[\s\S]*?v_discount/);
  assert.match(orderRpc, /select v_order_id, p\.id, p\.name, p\.slug, p\.price, requested\.quantity/);
});

test("shared product price presentation crosses out only a valid higher reference price", async () => {
  const [priceComponent, manager] = await Promise.all([
    read("../src/components/products/ProductPrice.jsx"),
    read("../src/components/admin/AdminProductsManager.jsx"),
  ]);
  assert.match(priceComponent, /getProductPricing\(price, compareAtPrice\)/);
  assert.match(priceComponent, /<del className=\{compareAtClassName\} aria-label=\{`Regular price:/);
  assert.match(manager, /<ProductPrice price=\{product\.price\} compareAtPrice=\{product\.compareAtPrice\}/);
});
