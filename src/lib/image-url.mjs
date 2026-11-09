const CATEGORY_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IPV4_HOST_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;

export function validateHttpsImageUrl(value) {
  if (typeof value !== "string") return { ok: false };
  const imageUrl = value.trim();
  if (!imageUrl || imageUrl.length > 2048) return { ok: false };

  try {
    const parsed = new URL(imageUrl);
    const hostname = parsed.hostname.toLowerCase();
    const blockedHost = hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      hostname.startsWith("[") || IPV4_HOST_PATTERN.test(hostname);

    if (parsed.protocol !== "https:" || parsed.username || parsed.password || blockedHost) {
      return { ok: false };
    }
  } catch {
    return { ok: false };
  }

  return { ok: true, value: imageUrl };
}

export function isSafeExternalImageUrl(value) {
  return validateHttpsImageUrl(value).ok;
}

export function slugifyCategory(value) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
}

export function normalizeCategoryInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "invalid" };
  }

  const name = typeof input.name === "string" ? input.name.trim() : "";
  const rawSlug = input.slug === undefined || input.slug === null ? "" : input.slug;
  const description = input.description === undefined || input.description === null ? "" : input.description;
  const rawImageUrl = input.imageUrl === undefined || input.imageUrl === null ? "" : input.imageUrl;
  const slug = slugifyCategory(typeof rawSlug === "string" && rawSlug.trim() ? rawSlug : name);
  const rawSortOrder = input.sortOrder;
  const sortOrder = typeof rawSortOrder === "number"
    ? rawSortOrder
    : typeof rawSortOrder === "string" && /^\d+$/.test(rawSortOrder.trim())
      ? Number(rawSortOrder)
      : Number.NaN;

  if (!name || name.length > 120 || !CATEGORY_SLUG_PATTERN.test(slug) ||
      (typeof rawSlug !== "string") || (typeof description !== "string") || description.length > 2000 ||
      !Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000 ||
      typeof input.isActive !== "boolean" || typeof rawImageUrl !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const image = rawImageUrl.trim() ? validateHttpsImageUrl(rawImageUrl) : { ok: true, value: null };
  if (!image.ok) return { ok: false, reason: "image" };

  return {
    ok: true,
    value: {
      name,
      slug,
      description: description.trim() || null,
      sort_order: sortOrder,
      is_active: input.isActive,
      image_url: image.value,
    },
  };
}

export function validateCategoryForm(input) {
  const normalized = normalizeCategoryInput(input);
  if (normalized.ok) return { ...normalized, errors: {} };

  const errors = {};
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const rawSlug = typeof input?.slug === "string" ? input.slug.trim() : "";
  const slug = slugifyCategory(rawSlug || name);
  const description = input?.description;
  const rawSortOrder = input?.sortOrder;
  const sortOrder = typeof rawSortOrder === "number"
    ? rawSortOrder
    : typeof rawSortOrder === "string" && /^\d+$/.test(rawSortOrder.trim())
      ? Number(rawSortOrder)
      : Number.NaN;

  if (!name || name.length > 120) errors.name = "Enter a category name of up to 120 characters.";
  if (typeof input?.slug !== "string" || !CATEGORY_SLUG_PATTERN.test(slug)) errors.slug = "Enter a URL-safe slug using lowercase letters, numbers, and hyphens.";
  if (typeof description !== "string" || description.length > 2000) errors.description = "Description must be 2,000 characters or fewer.";
  if (!Number.isSafeInteger(sortOrder) || sortOrder < 0 || sortOrder > 100000) errors.sortOrder = "Enter a whole display order from 0 to 100,000.";
  if (typeof input?.isActive !== "boolean") errors.isActive = "Choose whether this category is visible in the storefront.";
  if (typeof input?.imageUrl !== "string" || (input.imageUrl.trim() && !validateHttpsImageUrl(input.imageUrl).ok)) {
    errors.imageUrl = "Enter a valid public HTTPS image URL, or leave it empty to use the category artwork.";
  }
  if (Object.keys(errors).length === 0) errors.name = "Check the category details and try again.";
  return { ok: false, reason: normalized.reason, errors };
}
