import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildProductImageSavePayload,
  buildProductSavePayload,
  formatImageObjectPosition,
  normalizeImageFocalPoint,
} from "../src/lib/products/product-form.mjs";
import { normalizeProductImagePositions } from "../src/lib/products/product-image-state.mjs";
import { buildProductGalleryItems } from "../src/lib/products/product-gallery.mjs";
import { appendProductImage, removeProductImageAt, replaceFirstProductImage, validateProductForm } from "../src/lib/products/product-form.mjs";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("admin products form keeps its textarea utility defined and continues to mount the editor", async () => {
  const [form, page, manager] = await Promise.all([
    source("../src/components/admin/AddProductForm.jsx"),
    source("../src/app/admin/products/page.js"),
    source("../src/components/admin/AdminProductsManager.jsx"),
  ]);
  assert.match(form, /const textareaClass =/);
  assert.match(form, /className=\{textareaClass\}/);
  assert.match(page, /<AdminProductsManager/);
  assert.match(manager, /<AddProductForm/);
});

test("legacy product images and new external URLs receive sensible default crop points", () => {
  assert.deepEqual(normalizeImageFocalPoint({}), { focal_x: 50, focal_y: 50 });
  assert.deepEqual(normalizeImageFocalPoint({ focal_x: 125, focal_y: -3 }), { focal_x: 100, focal_y: 0 });
  assert.equal(formatImageObjectPosition({ focal_x: 20, focal_y: 72.5 }), "20% 72.5%");
  assert.deepEqual(buildProductImageSavePayload(["/images/products/legacy.jpg"]), [
    { url: "/images/products/legacy.jpg", focal_x: 50, focal_y: 50 },
  ]);
});

test("admin edit form loads, previews, changes, and submits each saved focal point", async () => {
  const [form, editor, actions, adminLoader] = await Promise.all([
    source("../src/components/admin/AddProductForm.jsx"),
    source("../src/components/admin/ProductImageFocalEditor.jsx"),
    source("../src/app/admin/actions.js"),
    source("../src/lib/admin.js"),
  ]);
  assert.match(form, /normalizeImageFocalPoint\(image\)/);
  assert.match(form, /onChange=\{\(position\) => updateImageReferences/);
  assert.match(actions, /p_image_focal_points/);
  assert.match(actions, /save_admin_product_with_image_focal_points/);
  assert.match(adminLoader, /images:product_images\([^)]*focal_x,focal_y/);
  assert.match(editor, /onChange=\{\(event\) => updatePosition\("focal_x"/);
  assert.match(editor, /onChange=\{\(event\) => updatePosition\("focal_y"/);
  assert.match(editor, /style=\{\{ objectPosition: formatImageObjectPosition\(position\) \}\}/);
  assert.match(editor, /image host could not be reached/);
});

test("focal positions persist through the atomic save payload and migration defaults old images", async () => {
  const migration = await source("../supabase/migrations/20261124000000_product_image_focal_points.sql");
  const images = buildProductImageSavePayload([
    { url: "https://cdn.example.com/serum.jpg", focal_x: 22, focal_y: 68 },
    { url: "/images/products/legacy.jpg", focal_x: 50, focal_y: 50 },
  ]);
  assert.deepEqual(images[0], { url: "https://cdn.example.com/serum.jpg", focal_x: 22, focal_y: 68 });
  const reopenedEditPayload = buildProductSavePayload({ name: "Serum", ingredients: [] }, {
    productId: "product-id",
    images: [{ url: "https://cdn.example.com/serum.jpg", focal_x: 22, focal_y: 68 }],
  });
  assert.deepEqual(reopenedEditPayload.images[0], images[0]);
  assert.match(migration, /focal_x numeric\(5, 2\) not null default 50/);
  assert.match(migration, /focal_y numeric\(5, 2\) not null default 50/);
  assert.match(migration, /private\.is_admin\(\)/);
  assert.match(migration, /public\.save_admin_product_with_compare_at\(/);
  assert.match(migration, /set focal_x = [\s\S]*?focal_y =/);
  assert.match(migration, /revoke all on function public\.save_admin_product_with_image_focal_points/);
  assert.match(migration, /grant execute on function public\.save_admin_product_with_image_focal_points[\s\S]*?to authenticated/);
});

test("storefront product cards and detail gallery use the saved 4:5 cover position", async () => {
  const [catalog, card, detail, gallery, focalEditor] = await Promise.all([
    source("../src/lib/catalog.js"),
    source("../src/components/products/ProductCard.jsx"),
    source("../src/components/products/ProductDetail.jsx"),
    source("../src/components/products/ProductGallery.jsx"),
    source("../src/components/admin/ProductImageFocalEditor.jsx"),
  ]);
  assert.match(catalog, /focal_x,focal_y/);
  assert.match(catalog, /imagePositions/);
  assert.match(card, /aspect-\[4\/5\]/);
  assert.match(card, /className=\{`object-cover/);
  assert.match(card, /objectPosition: product\.imagePositions\?\.\[0\]/);
  assert.match(detail, /imagePositions=\{product\.imagePositions\}/);
  assert.match(gallery, /buildProductGalleryItems\(galleryImages, imagePositions\)/);
  assert.match(gallery, /objectPosition: activeImage\.objectPosition/);
  assert.match(gallery, /objectPosition: item\.objectPosition/);
  assert.match(focalEditor, /aspect-\[4\/5\]/);
  assert.match(focalEditor, /className="object-cover"/);
});

test("product gallery keeps each selected URL paired with its own saved focal point", async () => {
  const images = ["first.jpg", "second.jpg", "third.jpg", "fourth.jpg"];
  const positions = ["0% 0%", "50% 50%", "100% 100%", "25% 75%"];
  const items = buildProductGalleryItems(images, positions);
  assert.deepEqual(items.map(({ url, objectPosition }) => [url, objectPosition]), images.map((url, index) => [url, positions[index]]));
  assert.equal(buildProductGalleryItems(["legacy.jpg"], [])[0].objectPosition, "50% 50%");
  assert.equal(buildProductGalleryItems(["legacy.jpg"], ["invalid"])[0].objectPosition, "50% 50%");
  const gallery = await source("../src/components/products/ProductGallery.jsx");
  assert.match(gallery, /const activeImage = galleryItems\[activeIndex\]/);
  assert.match(gallery, /onClick=\{\(\) => setActiveIndex\(index\)\}/);
  assert.match(gallery, /src=\{activeImage\.url\}/);
  assert.match(gallery, /style=\{\{ objectPosition: activeImage\.objectPosition \}\}/);
});

test("selected image list operations produce payloads with ordered URLs and associated focal points", () => {
  const original = [{ url: "first.jpg", focal_x: 10, focal_y: 20 }, { url: "second.jpg", focal_x: 80, focal_y: 70 }];
  const appended = appendProductImage(original, { url: "third.jpg", focal_x: 25, focal_y: 75 });
  assert.deepEqual(buildProductImageSavePayload(appended).map((image) => [image.url, image.focal_x, image.focal_y]), [
    ["first.jpg", 10, 20], ["second.jpg", 80, 70], ["third.jpg", 25, 75],
  ]);
  const replaced = replaceFirstProductImage(appended, { url: "replacement.jpg", focal_x: 1, focal_y: 2 });
  assert.deepEqual(replaced.map((image) => image.url), ["replacement.jpg", "second.jpg", "third.jpg"]);
  assert.deepEqual(removeProductImageAt(replaced, 1).map((image) => image.url), ["replacement.jpg", "third.jpg"]);
  assert.equal(validateProductForm({ name: "P", slug: "p", brandName: "B", categoryId: "c", price: "1", stockQuantity: "0", images: [] }).errors.images, "Add between 1 and 10 product images.");
});

test("local corrective order-item trigger exception only permits product reference detachment", async () => {
  const migration = await source("../supabase/migrations/20261126000000_allow_product_reference_detachment.sql");
  assert.match(migration, /old\.product_id is not null\s+and new\.product_id is null/i);
  assert.match(migration, /row\([\s\S]*new\.product_name_snapshot[\s\S]*new\.product_slug_snapshot[\s\S]*new\.unit_price[\s\S]*new\.quantity[\s\S]*new\.line_total[\s\S]*new\.created_at[\s\S]*\) is not distinct from row\([\s\S]*old\.product_name_snapshot[\s\S]*old\.product_slug_snapshot[\s\S]*old\.unit_price[\s\S]*old\.quantity[\s\S]*old\.line_total[\s\S]*old\.created_at/);
  assert.match(migration, /tg_op = 'DELETE'[\s\S]*?pg_catalog\.pg_trigger_depth\(\) > 1[\s\S]*?not exists/i);
  assert.match(migration, /raise exception 'Order item snapshots are immutable' using errcode = '23514'/i);
});

test("wishlist persistence keeps valid focal positions associated with their saved image order", async () => {
  const [wishlist, card] = await Promise.all([
    source("../src/constants/WishlistContext.js"),
    source("../src/components/products/ProductCard.jsx"),
  ]);
  assert.match(wishlist, /normalizeProductImagePositions\(product\.imagePositions, images\.length\)/);
  assert.match(wishlist, /imagePositions,/);
  assert.match(wishlist, /normalizeProductImagePositions/);
  assert.match(card, /objectPosition: product\.imagePositions\?\.\[0\] \?\? "50% 50%"/);
  assert.deepEqual(normalizeProductImagePositions(["22% 68%", "110% 20%"], 3), ["22% 68%", "50% 50%", "50% 50%"]);
  assert.deepEqual(normalizeProductImagePositions(null, 1), ["50% 50%"]);
});
