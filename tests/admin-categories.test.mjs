import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { normalizeCategoryInput, slugifyCategory, validateCategoryForm, validateHttpsImageUrl } from "../src/lib/image-url.mjs";

const migration = await readFile(new URL("../supabase/migrations/20261121000000_categories_image_url.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/admin/actions.js", import.meta.url), "utf8");
const adminLoader = await readFile(new URL("../src/lib/admin.js", import.meta.url), "utf8");
const catalog = await readFile(new URL("../src/lib/catalog.js", import.meta.url), "utf8");
const manager = await readFile(new URL("../src/components/admin/AdminCategoriesManager.jsx", import.meta.url), "utf8");
const imageField = await readFile(new URL("../src/components/admin/ExternalImageUrlField.jsx", import.meta.url), "utf8");
const storefrontSection = await readFile(new URL("../src/components/home/CategoriesSection.jsx", import.meta.url), "utf8");
const schema = await readFile(new URL("../supabase/migrations/20261021000000_initial_schema.sql", import.meta.url), "utf8");

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

test("category create and edit validation covers name, slug, description, image, visibility, and display order", () => {
  const input = {
    name: "  Skin Care ", slug: "skin-care", description: "  Products for daily care  ",
    imageUrl: "https://cdn.example.com/skin-care.jpg", sortOrder: "8", isActive: false,
  };
  const create = validateCategoryForm(input);
  assert.equal(create.ok, true);
  assert.deepEqual(create.errors, {});
  assert.equal(create.value.slug, "skin-care");
  assert.equal(create.value.sort_order, 8);
  assert.equal(create.value.is_active, false);
  assert.equal(validateCategoryForm({ ...input, name: "", slug: "bad slug", imageUrl: "http://bad.example/image.png", sortOrder: "-1" }).ok, false);
  const invalid = validateCategoryForm({ ...input, name: "", imageUrl: "http://bad.example/image.png", sortOrder: "1.5" });
  assert.ok(invalid.errors.name);
  assert.ok(invalid.errors.imageUrl);
  assert.ok(invalid.errors.sortOrder);
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
  assert.match(actions, /export async function saveCategory\(input\)[\s\S]*?authorizedClient\(\)/);
  assert.match(actions, /export async function setCategoryActive\(categoryId, isActive\)/);
});

test("admin and storefront category queries include the URL while preserving local fallbacks", () => {
  assert.match(adminLoader, /select\("id,name,slug,description,image_url,sort_order,is_active,created_at"\)/);
  assert.match(catalog, /select\("id,slug,name,description,image_url,sort_order"\)/);
  assert.match(catalog, /imageUrl: row\.image_url \?\? null/);
  assert.match(manager, /category\.image_url \|\| categoryImages\[category\.slug\]/);
  assert.match(manager, /<ConfirmationDialog/);
  assert.match(manager, /setCategoryToDelete\(category\)/);
  assert.match(manager, /setSlugEdited/);
  assert.match(manager, /sortOrder: String\(category\.sort_order \?\? 0\)/);
  assert.match(manager, /isActive: category\.is_active \?\? true/);
  assert.match(manager, /category\.description \?\? ""/);
  assert.match(manager, /imageUrl: category\.image_url \?\? ""/);
  assert.match(manager, /value=\{form\.sortOrder\}/);
  assert.match(manager, /checked=\{form\.isActive\}/);
});

test("image preview uses direct unoptimized rendering and has graceful failure feedback", () => {
  assert.match(imageField, /Upload image using URL \(Preferable\)/);
  assert.match(imageField, /unoptimized/);
  assert.match(imageField, /onError=\{\(\) => \{[\s\S]*?setPreview\(\{ value, state: "failed" \}\)/);
  assert.match(imageField, /\(previewState === "loading" \|\| previewState === "loaded"\)/);
  assert.match(imageField, /Preview unavailable/);
  assert.match(imageField, /does not upload or proxy it/);
  assert.match(imageField, /previewAspectClassName = "aspect-square"/);
  assert.match(imageField, /error && <p id=\{`\$\{id\}-error`\}/);
  assert.match(manager, /previewAspectClassName="aspect-square"/);
  assert.match(manager, /800 × 800 px; aim for at least 400 × 400 px/);
  assert.match(storefrontSection, /h-16 w-16[\s\S]*?object-cover/);
  assert.match(storefrontSection, /rounded-full/);
});

test("category deletion remains blocked by assigned products and uses themed confirmation", () => {
  assert.match(schema, /category_id uuid not null references public\.categories \(id\) on delete restrict/i);
  assert.match(actions, /result\.error\?\.code === "23503"[\s\S]*?Move those products to another category/);
  assert.match(manager, /<ConfirmationDialog/);
  assert.match(manager, /Categories used by products cannot be deleted/);
  assert.match(manager, /onConfirm=\{remove\}/);
  assert.doesNotMatch(manager, /window\.(?:alert|confirm|prompt)\s*\(/);
});

test("category form validates inline, blocks duplicate submits, and preserves values when saving fails", () => {
  assert.match(manager, /validateCategoryForm\(input\)/);
  assert.match(manager, /submitLock\.current/);
  assert.match(manager, /setSaveError\(result\.message\)/);
  assert.match(manager, /Your changes are still here/);
  assert.match(manager, /showToast\(message, "error"\)/);
  assert.match(manager, /setIsOpen\(false\)[\s\S]*router\.refresh\(\)/);
  assert.match(manager, /onChange=\{\(event\) => \{ setSlugEdited\(true\); updateField\("slug", slugifyCategory/);
});
