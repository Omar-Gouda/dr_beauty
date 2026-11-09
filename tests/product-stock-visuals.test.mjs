import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { getProductImageStateClass } from "../src/lib/products/product-image-state.mjs";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("out-of-stock image state is grayscale and available or unknown inventory stays normal", () => {
  assert.equal(getProductImageStateClass(false), "grayscale");
  assert.equal(getProductImageStateClass(true), "");
  assert.equal(getProductImageStateClass(null), "");
  assert.equal(getProductImageStateClass(undefined), "");
  // The class is derived directly from the current availability prop, so a
  // stock update from false to true restores the image without stale state.
  let availability = false;
  assert.equal(getProductImageStateClass(availability), "grayscale");
  availability = true;
  assert.equal(getProductImageStateClass(availability), "");
});

test("regular and featured cards share grayscale image styling and readable stock labels", async () => {
  const [card, featured, badge] = await Promise.all([
    source("../src/components/products/ProductCard.jsx"),
    source("../src/components/home/FeaturedProducts.jsx"),
    source("../src/components/products/ProductStockBadge.jsx"),
  ]);

  for (const component of [card, featured]) {
    assert.match(component, /getProductImageStateClass\(product\.inStock\)/);
    assert.match(component, /<ProductStockBadge inStock=\{product\.inStock\}/);
    assert.match(component, /className=\{`object-cover[^\n]*getProductImageStateClass/);
    assert.doesNotMatch(component, /product\.inStock === false \? "opacity-70"/);
  }
  assert.match(card, /className="mb-3 min-w-0 break-words[^\n]*text-\[var\(--color-text\)\]/);
  assert.match(featured, /className="mb-2 min-w-0 break-words[^\n]*text-\[var\(--color-text\)\]/);
  assert.match(badge, /inStock !== false/);
  assert.match(badge, /text-white/);
  assert.match(badge, />\s*Out of Stock\s*</);
});

test("product detail gallery applies grayscale to images and retains normal product text", async () => {
  const [gallery, detail] = await Promise.all([
    source("../src/components/products/ProductGallery.jsx"),
    source("../src/components/products/ProductDetail.jsx"),
  ]);
  assert.match(detail, /inStock=\{product\.inStock\}/);
  assert.equal((gallery.match(/getProductImageStateClass\(inStock\)/g) ?? []).length, 2,
    "main and thumbnail images receive the same availability treatment");
  assert.match(gallery, /<ProductStockBadge inStock=\{inStock\}/);
  assert.doesNotMatch(gallery, /className=\{`[^`]*grayscale[^`]*`\}[^>]*>\s*<\/div>/);
  assert.match(detail, /text-\[var\(--color-text\)\]/);
});

test("all regular storefront product sections use ProductCard, and unavailable cart items match", async () => {
  const [shop, detail, wishlist, category, cartItem] = await Promise.all([
    source("../src/components/products/ShopCatalog.jsx"),
    source("../src/components/products/ProductDetail.jsx"),
    source("../src/app/(store)/wishlist/page.js"),
    source("../src/app/(store)/categories/[slug]/page.js"),
    source("../src/components/cart/CartItem.jsx"),
  ]);
  assert.match(shop, /<ProductCard key=\{product\.id\} product=\{product\}/);
  assert.match(detail, /<ProductCard key=\{relProduct\.id\} product=\{relProduct\}/);
  assert.match(wishlist, /<ProductCard key=\{product\.id\}/);
  assert.match(category, /<ProductCard key=\{product\.id\}/);
  assert.match(cartItem, /getProductImageStateClass\(availabilityStatus !== "unavailable"\)/);
  assert.match(cartItem, /<ProductStockBadge inStock=\{availabilityStatus === "unavailable" \? false : null\}/);
});
