import { validateProductPricing } from "./pricing.mjs";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeProductIngredients(values) {
  if (!Array.isArray(values)) return [];
  const seen = new Set();
  return values.reduce((ingredients, value) => {
    if (typeof value !== "string") return ingredients;
    const ingredient = value.trim();
    const normalized = ingredient.toLowerCase();
    if (!ingredient || seen.has(normalized)) return ingredients;
    seen.add(normalized);
    ingredients.push(ingredient);
    return ingredients;
  }, []);
}

export function hasDuplicateProductIngredient(values, candidate, excludedIndex = -1) {
  const normalized = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  return Boolean(normalized) && values.some((value, index) =>
    index !== excludedIndex && typeof value === "string" && value.trim().toLowerCase() === normalized);
}

export function appendProductIngredient(values) {
  return [...values, ""];
}

export function removeProductIngredient(values, index) {
  return values.filter((_, row) => row !== index);
}

export function normalizeImageFocalPoint(value = {}) {
  const x = Number(value?.focal_x ?? value?.x);
  const y = Number(value?.focal_y ?? value?.y);
  return {
    focal_x: Number.isFinite(x) ? Math.min(100, Math.max(0, Math.round(x * 100) / 100)) : 50,
    focal_y: Number.isFinite(y) ? Math.min(100, Math.max(0, Math.round(y * 100) / 100)) : 50,
  };
}

export function formatImageObjectPosition(value) {
  const { focal_x: x, focal_y: y } = normalizeImageFocalPoint(value);
  return `${x}% ${y}%`;
}

export function buildProductImageSavePayload(images) {
  return images.map((image) => ({
    url: typeof image === "string" ? image : image.url ?? image.image_url,
    ...normalizeImageFocalPoint(image),
  }));
}

export function appendProductImage(images, image) {
  return [...(Array.isArray(images) ? images : []), image];
}

export function replaceFirstProductImage(images, image) {
  const current = Array.isArray(images) ? images : [];
  return current.length ? [image, ...current.slice(1)] : [image];
}

export function removeProductImageAt(images, index) {
  return Array.isArray(images) ? images.filter((_, currentIndex) => currentIndex !== index) : [];
}

export function parseProductIngredients(value) {
  if (typeof value !== "string" || !value.trim()) return [];
  const legacyOrSavedEntries = value.includes("\n")
    ? value.split(/\r?\n/)
    : value.split(/\s*[,;]\s*/);
  return normalizeProductIngredients(legacyOrSavedEntries);
}

export function serializeProductIngredients(values) {
  return normalizeProductIngredients(values).join("\n");
}

export function suggestProductSlug(value) {
  return String(value ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 240);
}

export function validateProductForm(values) {
  const errors = {};
  if (!String(values.name ?? "").trim()) errors.name = "Enter a product name.";
  if (!SLUG_PATTERN.test(String(values.slug ?? "").trim())) errors.slug = "Use a URL-safe slug with lowercase letters, numbers, and hyphens.";
  if (!String(values.brandName ?? "").trim()) errors.brandName = "Enter a brand name.";
  if (!values.categoryId) errors.categoryId = "Choose a category.";
  const pricing = validateProductPricing(String(values.price ?? ""), String(values.compareAtPrice ?? ""));
  if (!pricing.ok) errors.price = pricing.message;
  const stockText = String(values.stockQuantity ?? "").trim();
  const stock = Number(stockText);
  if (!/^\d+$/.test(stockText) || !Number.isSafeInteger(stock) || stock > 2147483647) {
    errors.stockQuantity = "Enter a whole stock quantity from 0 to 2,147,483,647.";
  }
  if (!Array.isArray(values.images) || values.images.length < 1 || values.images.length > 10) {
    errors.images = "Add between 1 and 10 product images.";
  }
  if (serializeProductIngredients(values.ingredients).length > 10000) {
    errors.ingredients = "Key ingredients must be 10,000 characters or fewer.";
  }
  return { ok: Object.keys(errors).length === 0, errors, pricing };
}

export function buildProductSavePayload(values, { productId, images }) {
  return {
    id: productId || undefined,
    name: String(values.name ?? ""),
    slug: String(values.slug ?? ""),
    brandName: String(values.brandName ?? ""),
    categoryId: String(values.categoryId ?? ""),
    price: String(values.price ?? ""),
    compareAtPrice: String(values.compareAtPrice ?? ""),
    stockQuantity: String(values.stockQuantity ?? ""),
    ingredients: serializeProductIngredients(values.ingredients),
    description: String(values.description ?? ""),
    isActive: values.isActive === true,
    isBestseller: values.isBestseller === true,
    images: buildProductImageSavePayload(images),
  };
}
