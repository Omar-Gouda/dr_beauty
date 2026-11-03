import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  addAvailableProductToCart,
  isProductAvailableForPurchase,
  normalizeProductAvailability,
} from "../src/lib/products/cart-availability.mjs";

const product = { id: "product-1", name: "Test product" };

test("only a strict verified true state is purchasable", () => {
  assert.equal(isProductAvailableForPurchase(true), true);
  for (const value of [false, null, undefined, "true", 1]) {
    assert.equal(isProductAvailableForPurchase(value), false);
  }
});

test("availability RPC rows are validated and omitted products fail closed", () => {
  assert.deepEqual(normalizeProductAvailability(["active", "inactive"], [
    { product_id: "active", is_available: true },
  ]), {
    verified: true,
    availability: { active: true, inactive: false },
  });

  for (const rows of [
    null,
    [{ product_id: "active", is_available: "yes" }],
    [{ product_id: "unexpected", is_available: true }],
    [
      { product_id: "active", is_available: true },
      { product_id: "active", is_available: false },
    ],
  ]) {
    assert.deepEqual(normalizeProductAvailability(["active"], rows), {
      verified: false,
      availability: {},
    });
  }
});

test("adds a product only after availability is verified as true", async () => {
  let addedProduct = null;
  const result = await addAvailableProductToCart({
    product,
    checkAvailability: async (productId) => ({ available: productId === product.id, verified: true }),
    addToCart: (value) => { addedProduct = value; return true; },
  });

  assert.deepEqual(result, { ok: true, reason: "added" });
  assert.equal(addedProduct, product);
});

test("does not add when the availability query says out of stock", async () => {
  let addCalled = false;
  const result = await addAvailableProductToCart({
    product,
    checkAvailability: async () => ({ available: false, verified: true }),
    addToCart: () => { addCalled = true; return true; },
  });

  assert.deepEqual(result, { ok: false, reason: "out_of_stock" });
  assert.equal(addCalled, false);
});

test("fails closed when availability is unavailable, malformed, or throws", async (t) => {
  const cases = [
    ["query failure", async () => ({ available: true, verified: false })],
    ["malformed response", async () => ({ available: true })],
    ["thrown error", async () => { throw new Error("private diagnostic"); }],
  ];

  for (const [name, checkAvailability] of cases) {
    await t.test(name, async () => {
      let addCalled = false;
      const result = await addAvailableProductToCart({
        product,
        checkAvailability,
        addToCart: () => { addCalled = true; return true; },
      });
      assert.deepEqual(result, { ok: false, reason: "availability_unverified" });
      assert.equal(addCalled, false);
    });
  }
});

test("reports local cart persistence failure without claiming success", async () => {
  const result = await addAvailableProductToCart({
    product,
    checkAvailability: async () => ({ available: true, verified: true }),
    addToCart: () => false,
  });

  assert.deepEqual(result, { ok: false, reason: "cart_rejected" });
});

test("product cards and detail controls disable adding unless the availability RPC returned true", async () => {
  const [card, detail, featured, cart, checkout] = await Promise.all([
    readFile(new URL("../src/components/products/ProductCard.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/products/ProductDetail.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/home/FeaturedProducts.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/constants/CartContext.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(checkout)/checkout/CheckoutForm.jsx", import.meta.url), "utf8"),
  ]);
  for (const source of [card, detail, featured]) {
    assert.match(source, /isProductAvailableForPurchase\(product\.inStock\)/);
  }
  assert.match(cart, /getProductAvailability\(currentProductIds\)/);
  assert.match(cart, /verifyCartAvailability/);
  assert.match(checkout, /verifyCartAvailability\(\)/);
});
