import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  appendProductIngredient,
  buildProductSavePayload,
  hasDuplicateProductIngredient,
  normalizeProductIngredients,
  parseProductIngredients,
  removeProductIngredient,
  serializeProductIngredients,
  suggestProductSlug,
  validateProductForm,
} from "../src/lib/products/product-form.mjs";
import { validateHttpsImageUrl } from "../src/lib/image-url.mjs";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

const validValues = {
  name: "Serum",
  slug: "serum",
  brandName: "Dr Beauty",
  categoryId: "category-id",
  price: "750.00",
  compareAtPrice: "900.00",
  stockQuantity: "12",
  ingredients: ["Niacinamide"],
  description: "Clinical details",
  isActive: true,
  isBestseller: false,
  images: ["/images/products/serum.jpg"],
};

test("product name suggests a normalized editable slug", () => {
  assert.equal(suggestProductSlug("  Crème + Retinol Sérum! "), "creme-retinol-serum");
});

test("legacy ingredient text and newline saves parse into ordered ingredient rows", () => {
  assert.deepEqual(parseProductIngredients("Aloe Vera, Olive Oil; Vitamin E"), ["Aloe Vera", "Olive Oil", "Vitamin E"]);
  assert.deepEqual(parseProductIngredients("Aloe Vera\r\nOlive Oil\nVitamin E"), ["Aloe Vera", "Olive Oil", "Vitamin E"]);
  assert.deepEqual(parseProductIngredients("A single legacy ingredient"), ["A single legacy ingredient"]);
  assert.deepEqual(parseProductIngredients("  "), []);
});

test("ingredient editor operations add and remove rows, ignore empties, prevent duplicates, and preserve order", () => {
  const rows = ["Aloe Vera", "", "Vitamin E"];
  assert.deepEqual(appendProductIngredient(rows), [...rows, ""]);
  assert.deepEqual(removeProductIngredient(rows, 1), ["Aloe Vera", "Vitamin E"]);
  assert.equal(hasDuplicateProductIngredient(rows, " aloe vera "), true);
  assert.equal(hasDuplicateProductIngredient(rows, "Vitamin E", 2), false);
  assert.deepEqual(normalizeProductIngredients(["Aloe Vera", "", "OLIVE OIL", "aloe vera", "Vitamin E"]), ["Aloe Vera", "OLIVE OIL", "Vitamin E"]);
  assert.equal(serializeProductIngredients(["Aloe Vera", "", "Vitamin E"]), "Aloe Vera\nVitamin E");
});

test("form validation reports missing fields and invalid price, stock, and image count", () => {
  const invalid = validateProductForm({ ...validValues, slug: "Bad slug", categoryId: "", price: "4.999", compareAtPrice: "3", stockQuantity: "1.5", images: [] });
  assert.equal(invalid.ok, false);
  for (const field of ["slug", "categoryId", "price", "stockQuantity", "images"]) assert.ok(invalid.errors[field]);
  assert.equal(validateProductForm(validValues).ok, true);
});

test("database payload preserves the selected record and every supported form field", () => {
  const created = buildProductSavePayload(validValues, { images: validValues.images });
  assert.equal(created.id, undefined);
  assert.equal(created.stockQuantity, "12");
  assert.deepEqual(created.images, [{ url: validValues.images[0], focal_x: 50, focal_y: 50 }]);
  assert.equal(created.isActive, true);
  assert.equal(created.isBestseller, false);

  const edited = buildProductSavePayload(validValues, { productId: "product-123", images: ["https://cdn.example.com/serum.webp"] });
  assert.equal(edited.id, "product-123");
  assert.equal(edited.ingredients, "Niacinamide");
  assert.equal(edited.description, "Clinical details");
  assert.deepEqual(edited.images[0], { url: "https://cdn.example.com/serum.webp", focal_x: 50, focal_y: 50 });
});

test("HTTPS-only image entry keeps legacy local references intact for existing products", async () => {
  assert.equal(validateHttpsImageUrl("https://cdn.example.com/product.jpg").ok, true);
  assert.equal(validateHttpsImageUrl("http://cdn.example.com/product.jpg").ok, false);
  assert.equal(validateHttpsImageUrl("https://imgs.search.brave.com/sTkGFpFXWIJ8uYTzfOmm2Y8Vpy1C8LF70POdHr4QV00/rs:fit:860:0:0:0/ce/aHR0cHM6Ly9pbWFnZXMtbmEuc3NsLWltYWdlcy1hbWF6b24uY29tL2ltYWdlcy9JLzgxMWZpaFRjRCtMLmpwZw").ok, true);
  assert.equal(validateHttpsImageUrl("https://images-na.ssl-images-amazon.com/images/I/811fihTcD+L.jpg").ok, true);
  const form = await source("../src/components/admin/AddProductForm.jsx");
  const [imageField, focalEditor] = await Promise.all([
    source("../src/components/admin/ExternalImageUrlField.jsx"),
    source("../src/components/admin/ProductImageFocalEditor.jsx"),
  ]);
  assert.match(form, /ExternalImageUrlField[\s\S]*previewAspectClassName="aspect-\[4\/5\]"/);
  assert.doesNotMatch(form, /type="file"|Existing Local Image Paths|drag-and-drop/);
  assert.match(form, /url: image\.image_url/);
  const action = await source("../src/app/admin/actions.js");
  assert.match(action, /\^\\\/images\\\//);
  const [catalog, gallery] = await Promise.all([
    source("../src/lib/catalog.js"),
    source("../src/components/products/ProductGallery.jsx"),
  ]);
  assert.match(catalog, /\.map\(\(image\) => image\.image_url\)/);
  assert.match(gallery, /src=\{activeImage\.url\}/);
  assert.match(gallery, /unoptimized=\{!activeImage\.url\.startsWith\("\/"\)\}/);
  assert.match(focalEditor, /image host could not be reached/);
  assert.match(form, /imageUrlPreviewState !== "loaded"/);
  assert.match(form, /\[parsedUrl\.href\]: "loaded"/);
  assert.match(form, /previewedUrl === imageUrlRef\.current/);
  assert.match(imageField, /onPreviewStateChange\?\.\("loaded", value\)/);
  assert.match(form, /setImageReferences\(nextImages\)/);
  assert.match(form, /images: selectedImages/);
  assert.match(form, /replaceFirstProductImage\(currentImages, addedImage\)/);
  assert.match(form, /removeProductImageAt\(current, index\)/);
  assert.match(form, /imageReferencesRef\.current = nextImages/);
  assert.match(form, /Upload image using URL \(Preferable\)/);
  assert.match(imageField, /showPreview = true/);
  assert.match(imageField, /validateHttpsImageUrl\(value\)/);
  assert.match(imageField, /onLoad=\{\(\) => \{[\s\S]*?setPreview\(\{ value, state: "loaded" \}\)/);
  assert.match(imageField, /onError=\{\(\) => \{[\s\S]*?setPreview\(\{ value, state: "failed" \}\)/);
  assert.match(imageField, /unoptimized/);
});

test("form handles action errors without clearing entered fields and keeps activation controls", async () => {
  const [form, action] = await Promise.all([
    source("../src/components/admin/AddProductForm.jsx"),
    source("../src/app/admin/actions.js"),
  ]);
  assert.match(form, /catch \{[\s\S]*Your changes are still here; please try again/);
  assert.match(form, /router\.refresh\(\)/);
  assert.match(form, /name="isActive" type="checkbox"/);
  assert.match(form, /name="isBestseller" type="checkbox"/);
  assert.match(form, /IngredientListEditor values=\{ingredients\}/);
  const editor = await source("../src/components/admin/IngredientListEditor.jsx");
  assert.match(editor, /aria-label=\{`Remove ingredient/);
  assert.match(editor, /Add Ingredient/);
  const detail = await source("../src/components/products/ProductDetail.jsx");
  assert.match(detail, /ingredients\.map\(\(ingredient, index\)/);
  assert.match(detail, /Key ingredients/);
  assert.match(action, /typeof input\.stockQuantity === "string" && \/\^\\d\+\$\//);
  assert.match(action, /p_is_active: input\.isActive === true/);
  assert.match(action, /p_is_bestseller: input\.isBestseller === true/);
});
