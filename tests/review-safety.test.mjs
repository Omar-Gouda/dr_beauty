import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateProductReview } from "../src/lib/review-safety.mjs";

test("respectful negative feedback remains eligible for immediate publication", () => {
  assert.equal(validateProductReview({ rating: 2, body: "The product quality was disappointing." }), null);
  assert.equal(validateProductReview({ rating: 1, body: "This cream irritated my skin and I would not buy it again." }), null);
});

test("a direct threat, invalid rating, malformed text, or oversized review is rejected", () => {
  assert.equal(validateProductReview({ rating: 1, body: "I will hurt you if this happens again." }), "prohibited_content");
  assert.equal(validateProductReview({ rating: 0, body: "A review." }), "rating");
  assert.equal(validateProductReview({ rating: 5, body: "x".repeat(5001) }), "body");
  assert.equal(validateProductReview({ rating: 5, body: "unsafe\u0000text" }), "malformed");
  assert.equal(validateProductReview({ rating: 1, body: "You are a worthless idiot." }), "prohibited_content");
  assert.equal(validateProductReview({ rating: 1, body: "Fuck off." }), "prohibited_content");
});

test("new review visibility remains verified-purchase scoped and content is rendered as text", async () => {
  const [schema, action, detail, migration, abuseMigration] = await Promise.all([
    readFile(new URL("../supabase/migrations/20261021000000_initial_schema.sql", import.meta.url), "utf8"),
    readFile(new URL("../src/app/(store)/products/actions.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/products/ProductDetail.jsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20261109000000_shipping_configuration_featured_promotions_and_reviews.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20261111000000_product_review_direct_abuse_screening.sql", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /private\.has_purchased_product\(product_id\)/);
  assert.match(action, /validateProductReview/);
  assert.match(detail, /\{review\.body\}/);
  assert.doesNotMatch(detail, /dangerouslySetInnerHTML/);
  assert.match(migration, /alter column status set default 'approved'/);
  assert.match(migration, /status = 'approved'[\s\S]*?private\.has_purchased_product\(product_id\)/);
  assert.match(migration, /create trigger product_reviews_validate_content[\s\S]*?before insert or update/);
  assert.match(migration, /Review content is not allowed/);
  assert.match(abuseMigration, /create or replace function private\.validate_product_review_content/);
  assert.match(abuseMigration, /search_path = ''/);
  assert.match(abuseMigration, /worthless\|idiot\|moron/);
  assert.doesNotMatch(abuseMigration, /alter table public\.product_reviews[\s\S]*?status set default 'pending'/);
});
