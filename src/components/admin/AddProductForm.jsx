"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProduct } from "@/app/admin/actions";
import { useToast } from "@/constants/ToastContext";
import CustomSelect from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import ExternalImageUrlField from "@/components/admin/ExternalImageUrlField";
import IngredientListEditor from "@/components/admin/IngredientListEditor";
import ProductImageFocalEditor from "@/components/admin/ProductImageFocalEditor";
import {
  appendProductImage,
  buildProductSavePayload,
  normalizeImageFocalPoint,
  parseProductIngredients,
  removeProductImageAt,
  replaceFirstProductImage,
  suggestProductSlug,
  validateProductForm,
} from "@/lib/products/product-form.mjs";

const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 font-normal text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";
const textareaClass = "mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 font-normal text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";
export default function AddProductForm({ categories, product, onClose }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(product?.slug));
  const [imageReferences, setImageReferences] = useState((product?.images ?? []).map((image) => ({
    url: image.image_url,
    ...normalizeImageFocalPoint(image),
  })));
  const imageReferencesRef = useRef(imageReferences);
  const [ingredients, setIngredients] = useState(() => parseProductIngredients(product?.ingredients));
  const [imageUrl, setImageUrl] = useState("");
  const imageUrlRef = useRef("");
  const [imageUrlPreviewState, setImageUrlPreviewState] = useState("empty");
  const [imageMessage, setImageMessage] = useState("");
  const [previewStates, setPreviewStates] = useState(() => Object.fromEntries(
    (product?.images ?? []).map((image) => image.image_url)
      .filter((reference) => reference.startsWith("https://"))
      .map((reference) => [reference, "loading"]),
  ));
  const [categoryId, setCategoryId] = useState(product?.category_id ?? "");
  const categoryOptions = categories
    .filter((category) => category.is_active || category.id === product?.category_id)
    .map((category) => ({ value: category.id, label: category.is_active ? category.name : `${category.name} (inactive)` }));
  const updateImageReferences = (update) => {
    const nextImages = typeof update === "function" ? update(imageReferencesRef.current) : update;
    imageReferencesRef.current = nextImages;
    setImageReferences(nextImages);
  };

  const importImageUrl = (replaceFirst = false) => {
    if (imageUrlPreviewState !== "loaded") {
      setImageMessage(imageUrlPreviewState === "failed"
        ? "This direct image URL could not be previewed. Try another publicly accessible image URL."
        : "Wait for the direct image preview to load before adding it.");
      return;
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(imageUrl.trim());
    } catch {
      setImageMessage("Enter a complete HTTPS image URL.");
      return;
    }
    const host = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.protocol !== "https:" || parsedUrl.username || parsedUrl.password ||
        host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") ||
        host.endsWith(".internal") || host.startsWith("[") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
      setImageMessage("Use a public HTTPS image URL without credentials or a local-network address.");
      return;
    }
    const currentImages = imageReferencesRef.current;
    if (!replaceFirst && currentImages.length >= 10) {
      setImageMessage("A product can have up to 10 images.");
      return;
    }

    const addedImage = { url: parsedUrl.href, focal_x: 50, focal_y: 50 };
    const nextImages = replaceFirst
      ? replaceFirstProductImage(currentImages, addedImage)
      : appendProductImage(currentImages, addedImage);
    updateImageReferences(nextImages);
    setImageUrl("");
    imageUrlRef.current = "";
    setImageUrlPreviewState("empty");
    setImageMessage("");
    clearFieldError("images");
    // The candidate preview already loaded successfully. Keep that verified
    // state when promoting the URL into the selected images list; the editor
    // can still change it to an error if its own preview later fails.
    setPreviewStates((current) => ({ ...current, [parsedUrl.href]: "loaded" }));
  };

  const removeImage = (index) => {
    updateImageReferences((current) => removeProductImageAt(current, index));
    clearFieldError("images");
  };

  const clearFieldError = (field) => setFieldErrors((current) => {
    if (!current[field]) return current;
    const next = { ...current };
    delete next[field];
    return next;
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isPending) return;
    setError("");
    const selectedImages = imageReferencesRef.current;
    if (selectedImages.some((reference) => reference.url.startsWith("https://") && previewStates[reference.url] !== "loaded")) {
      setImageMessage("Wait for every remote image preview to load successfully, or remove or replace the unavailable URL.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const values = {
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      brandName: String(form.get("brand") ?? ""),
      categoryId,
      price: String(form.get("price") ?? ""),
      compareAtPrice: String(form.get("compareAtPrice") ?? ""),
      stockQuantity: String(form.get("stockQuantity") ?? ""),
      ingredients,
      description: String(form.get("description") ?? ""),
      isActive: form.get("isActive") === "on",
      isBestseller: form.get("isBestseller") === "on",
      images: selectedImages,
    };
    const validation = validateProductForm(values);
    setFieldErrors(validation.errors);
    if (!validation.ok) {
      const message = Object.values(validation.errors)[0];
      setError(message);
      showToast(message, "error");
      return;
    }
    setError("");
    const payload = buildProductSavePayload(values, { productId: product?.id, images: selectedImages });
    payload.price = validation.pricing.price;
    payload.compareAtPrice = validation.pricing.compareAtPrice ?? "";

    startTransition(async () => {
      try {
        const result = await saveProduct(payload);
        if (!result.ok) {
          setError(result.message);
          showToast(result.message, "error");
          return;
        }
        showToast(result.message);
        router.refresh();
        onClose?.();
      } catch {
        const message = "Product could not be saved. Your changes are still here; please try again.";
        setError(message);
        showToast(message, "error");
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6 text-xs">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="font-semibold text-[var(--color-text)]">Product Name *
          <input name="name" required maxLength={240} value={name} onChange={(event) => {
            const value = event.target.value;
            setName(value);
            clearFieldError("name");
            if (!slugEdited) setSlug(suggestProductSlug(value));
          }} placeholder="e.g. Advanced Retinol Serum" className={inputClass} aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? "product-name-error" : undefined} />
          {fieldErrors.name && <span id="product-name-error" className="mt-1 block text-xs font-normal text-red-700">{fieldErrors.name}</span>}
        </label>
        <label className="font-semibold text-[var(--color-text)]">Slug *
          <input name="slug" required maxLength={240} value={slug} onChange={(event) => { setSlugEdited(true); setSlug(suggestProductSlug(event.target.value)); clearFieldError("slug"); }} placeholder="auto-generated from product name" className={inputClass} aria-invalid={Boolean(fieldErrors.slug)} aria-describedby={fieldErrors.slug ? "product-slug-error" : undefined} />
          {fieldErrors.slug && <span id="product-slug-error" className="mt-1 block text-xs font-normal text-red-700">{fieldErrors.slug}</span>}
        </label>
        <label className="font-semibold text-[var(--color-text)]">Brand Name *
          <input name="brand" required maxLength={120} defaultValue={product?.brandName ?? ""} onChange={() => clearFieldError("brandName")} placeholder="e.g. Dr. Beauty" className={inputClass} aria-invalid={Boolean(fieldErrors.brandName)} aria-describedby={fieldErrors.brandName ? "product-brand-error" : undefined} />
          {fieldErrors.brandName && <span id="product-brand-error" className="mt-1 block text-xs font-normal text-red-700">{fieldErrors.brandName}</span>}
        </label>
        <label className="block space-y-1.5 font-semibold text-[var(--color-text)]">Category *
          <CustomSelect
            id="product-category"
            options={categoryOptions}
            value={categoryId}
            onChange={setCategoryId}
            placeholder="Choose a category"
            emptyMessage="No active categories are available. Add or activate a category first."
            disabled={isPending}
            error={fieldErrors.categoryId}
            ariaLabel="Product category"
          />
          <input type="hidden" name="categoryId" value={categoryId} />
        </label>
        <label className="font-semibold text-[var(--color-text)]">Selling Price (EGP) *
          <input name="price" type="number" required min="0" max="9999999999.99" step="0.01" defaultValue={product?.price ?? ""} onChange={() => clearFieldError("price")} placeholder="750.00" className={inputClass} aria-invalid={Boolean(fieldErrors.price)} aria-describedby={fieldErrors.price ? "product-price-error" : "product-price-help"} />
          <span id="product-price-help" className="mt-1 block text-[10px] font-normal leading-4 text-[var(--color-text-secondary)]">This is the payable price. When a compare-at price is set, this is shown as the sale price.</span>
          {fieldErrors.price && <span id="product-price-error" className="block text-xs font-normal text-red-700">{fieldErrors.price}</span>}
        </label>
        <label className="font-semibold text-[var(--color-text)]">Compare-at Price (EGP) (optional)
          <input name="compareAtPrice" type="number" min="0.01" max="9999999999.99" step="0.01" defaultValue={product?.compareAtPrice ?? ""} onChange={() => clearFieldError("price")} placeholder="Regular price before sale" className={inputClass} aria-invalid={Boolean(fieldErrors.price)} aria-describedby={fieldErrors.price ? "product-price-error" : "product-compare-at-help"} />
          <span id="product-compare-at-help" className="mt-1 block text-[10px] font-normal leading-4 text-[var(--color-text-secondary)]">Shown crossed out next to the selling price. It must be greater than the selling price.</span>
        </label>
        <label className="font-semibold text-[var(--color-text)]">Stock Quantity *
          <input name="stockQuantity" type="number" required min="0" max="2147483647" step="1" defaultValue={product?.stockQuantity ?? 0} onChange={() => clearFieldError("stockQuantity")} className={inputClass} aria-invalid={Boolean(fieldErrors.stockQuantity)} aria-describedby={fieldErrors.stockQuantity ? "product-stock-error" : undefined} />
          {fieldErrors.stockQuantity && <span id="product-stock-error" className="mt-1 block text-xs font-normal text-red-700">{fieldErrors.stockQuantity}</span>}
        </label>
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <div>
          <span className="block font-semibold text-[var(--color-text)]">Product Images *</span>
          <p className="mt-1 text-[10px] leading-5 text-[var(--color-text-secondary)]">Add public HTTPS image URLs. Remote images load directly in the customer’s browser; the server does not fetch them.</p>
          <p className="mt-2 text-[10px] leading-5 text-[var(--color-text-secondary)]">Storefront cards use a 4:5 portrait crop. Recommended source: 800 × 1000 px; aim for at least 400 × 500 px. These are guidelines, not upload limits. Higher-resolution originals generally look clearer, especially on high-density screens.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ExternalImageUrlField
            id="product-image-url"
            value={imageUrl}
            disabled={isPending}
            alt="New product image preview"
            label="Upload image using URL (Preferable)"
            helperText="Paste a direct public HTTPS image URL, not a search-result or gallery page. The preview loads in the browser; click Add URL to add it to the selected images. The server does not fetch or proxy it."
            previewAspectClassName="aspect-[4/5]"
            previewClassName="mx-auto max-w-64 overflow-hidden rounded-xl"
            className="min-w-0 flex-1"
            onChange={(value) => { imageUrlRef.current = value; setImageUrl(value); setImageMessage(""); }}
            onPreviewStateChange={(state, previewedUrl) => {
              if (previewedUrl === imageUrlRef.current) setImageUrlPreviewState(state);
            }}
          />
          <Button type="button" variant="secondary" disabled={isPending || !imageUrl.trim() || imageUrlPreviewState !== "loaded"} onClick={() => importImageUrl()} className="shrink-0">Add URL</Button>
          {imageReferences.length > 0 && <Button type="button" variant="outline" disabled={isPending || !imageUrl.trim() || imageUrlPreviewState !== "loaded"} onClick={() => importImageUrl(true)} className="shrink-0">Replace first image</Button>}
        </div>
        <p aria-live="polite" className="text-[10px] leading-5 text-[var(--color-text-secondary)]">
          {imageReferences.length} of 10 images selected. Previewing a URL does not add it until you click Add URL.
        </p>
        {(imageMessage || fieldErrors.images) && <p role="alert" className="text-xs text-red-700">{imageMessage || fieldErrors.images}</p>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {imageReferences.map((image, index) => (
            <div key={`${index}-${image.url}`} className="min-w-0">
              {image.url.startsWith("https://") && previewStates[image.url] === "loading" && <p role="status" className="mb-1 text-[10px] text-[var(--color-text-secondary)]">Loading preview…</p>}
              <ProductImageFocalEditor
                image={image}
                index={index}
                disabled={isPending}
                onPreviewStateChange={(state) => setPreviewStates((current) => current[image.url] === state ? current : ({ ...current, [image.url]: state }))}
                onChange={(position) => updateImageReferences((current) => current.map((entry, row) => row === index ? { ...entry, ...position } : entry))}
                onRemove={() => removeImage(index)}
              />
            </div>
          ))}
        </div>
        {imageReferences.some((reference) => reference.url.startsWith("/images/")) && (
          <p className="text-[10px] leading-5 text-[var(--color-text-secondary)]">This product has an existing local image reference. It will remain available on the storefront unless you remove it here.</p>
        )}
      </div>

      <IngredientListEditor values={ingredients} onChange={(next) => {
        setIngredients(next);
        clearFieldError("ingredients");
      }} disabled={isPending} error={fieldErrors.ingredients} />
      <label className="block font-semibold text-[var(--color-text)]">Clinical Description
        <textarea name="description" maxLength={10000} rows={3} defaultValue={product?.description ?? ""} className={textareaClass} />
      </label>

      <div className="flex flex-wrap gap-5 text-[var(--color-text-secondary)]">
        <label className="flex items-center gap-2"><input name="isActive" type="checkbox" defaultChecked={product?.is_active ?? false} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /> Active in storefront</label>
        <label className="flex items-center gap-2"><input name="isBestseller" type="checkbox" defaultChecked={product?.is_bestseller ?? false} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /> Featured bestseller</label>
      </div>

      {error && <p role="alert" className="rounded-xl border border-red-500/30 bg-red-500/5 p-3 text-red-600">{error}</p>}
      <div className="flex justify-end gap-3 border-t border-[var(--color-border)] pt-4">
        <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
        <Button type="submit" disabled={isPending || categoryOptions.length === 0}>
          {isPending ? "Saving…" : product ? "Save Changes" : "Save Product"}
        </Button>
      </div>
    </form>
  );
}
