import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCategoryInput, slugifyCategory, validateHttpsImageUrl } from "../src/lib/image-url.mjs";

const migration = await readFile(new URL("../supabase/migrations/20261121000000_categories_image_url.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/admin/actions.js", import.meta.url), "utf8");
const adminLoader = await readFile(new URL("../src/lib/admin.js", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/lib/catalog.js", import.meta.url), "utf8");
const manager = await readFile(new URL("../src/components/admin/AdminCategoriesManager.jsx", import.meta.url), "utf8");
const imageField = await readFile(new URL("../src/components/admin/ExternalImageUrlField.jsx", import.meta.url), "utf8");

test("category names generate editable, URL-safe slugs", () => {
  assert.equal(slugifyCategory("  Skin & Soin  "), "skin-soin");
  const result = normalizeCategoryInput({ name: "Skin Care", slug: "", sortOrder: "4", isActive: true });
  assert.equal(result.ok, true);
  assert.equal(result.value.slug, "skin-care");
});

test("category input rejects invalid fields and normalizes optional fields", () => {
  const valid = normalizeCategoryInput({
    name: " Hair Care ", slug: "hair-care", description: "  Hair products  ",
    imageUrl: "", sortOrder: 2, isActive: false,
  });
  assert.equal(valid.ok, true);
  assert.equal(valid.value.name, "Hair Care");
  assert.equal(valid.value.description, "Hair products");
  assert.equal(valid.value.image_url, null);
  const normalizedSlug = normalizeCategoryInput({ name: "Invalid", slug: "bad slug", sortOrder: 0, isActive: true });
  assert.equal(normalizedSlug.ok, true);
  assert.equal(normalizedSlug.value.slug, "bad-slug");
  assert.equal(normalizeCategoryInput({ name: "Invalid", slug: "valid", sortOrder: -1, isActive: true }).ok, false);
  assert.equal(normalizeCategoryInput({ name: "Invalid", slug: "valid", sortOrder: 0, isActive: "yes" }).ok, false);
});

test("external image URLs require HTTPS and reject unsafe URL forms", () => {
  assert.deepEqual(validateHttpsImageUrl(" https://cdn.example.com/cats/skin.jpg?size=large "), {
    ok: true,
    value: "https://cdn.example.com/cats/skin.jpg?size=large",
  });
  for (const url of [
    "http://cdn.example.com/image.jpg",
    "javascript:alert(1)",
    "https://user:password@cdn.example.com/image.jpg",
    "https://localhost/image.jpg",
    "https://127.0.0.1/image.jpg",
    "not a URL",
  ]) assert.equal(validateHttpsImageUrl(url).ok, false, url);
});

test("category persistence remains admin-authorized and relies on unique/FK constraints", () => {
  assert.match(actions, /export async function saveCategory\(input\)[\s\S]*?authorizedClient\(\)/);
  assert.match(actions, /export async function deleteCategory\(categoryId\)[\s\S]*?authorizedClient\(\)/);
  assert.match(actions, /result\.error\?\.code === "23505"/);
  assert.match(actions, /result\.error\?\.code === "23503"/);
  assert.match(actions, /function authorizedClient\(\)[\s\S]*?getAdminAccess\(\)[\s\S]*?access\.status === "authorized"/);
  assert.match(migration, /alter table public\.categories\s+add column image_url text/i);
  assert.match(migration, /image_url is null[\s\S]*?image_url ~\* '\^https:\/\//i);
  assert.doesNotMatch(migration, /storage\.|create bucket|enable row level security|create policy/i);
});

test("admin and storefront category queries include the URL while preserving local fallbacks", () => {
  assert.match(adminLoader, /select\("id,name,slug,description,image_url,sort_order,is_active,created_at"\)/);
  assert.match(catalog, /select\("id,slug,name,description,image_url,sort_order"\)/);
  assert.match(catalog, /imageUrl: row\.image_url \?\? null/);
  assert.match(manager, /category\.image_url \|\| categoryImages\[category\.slug\]/);
  assert.match(manager, /window\.confirm/);
  assert.match(manager, /setSlugEdited/);
});

test("image preview uses direct unoptimized rendering and has graceful failure feedback", () => {
  assert.match(imageField, /Upload image using URL \(Preferable\)/);
  assert.match(imageField, /unoptimized/);
  assert.match(imageField, /onError=\{\(\) => setPreview\(\{ value, state: "failed" \}\)\}/);
  assert.match(imageField, /\(previewState === "loading" \|\| previewState === "loaded"\)/);
  assert.match(imageField, /Preview unavailable/);
  assert.match(imageField, /does not upload or proxy it/);
});
