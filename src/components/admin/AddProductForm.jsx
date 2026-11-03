"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { saveProduct } from "@/app/admin/actions";
import { useToast } from "@/constants/ToastContext";
import CustomSelect from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import { validateProductPricing } from "@/lib/products/pricing.mjs";

const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 font-normal text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";
const textareaClass = "mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 font-normal text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";

export default function AddProductForm({ categories, product, onClose }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [imagePaths, setImagePaths] = useState((product?.images ?? []).map((image) => image.image_url).join("\n"));
  const [imageUrl, setImageUrl] = useState("");
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
  const imageReferences = imagePaths.split("\n").map((path) => path.trim()).filter(Boolean);

  const importImageUrl = (replaceFirst = false) => {
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
    if (!replaceFirst && imageReferences.length >= 10) {
      setImageMessage("A product can have up to 10 images.");
      return;
    }

    const nextImages = replaceFirst && imageReferences.length
      ? [parsedUrl.href, ...imageReferences.slice(1)]
      : [...imageReferences, parsedUrl.href];
    setImagePaths(nextImages.join("\n"));
    setImageUrl("");
    setImageMessage("");
    setPreviewStates((current) => ({ ...current, [parsedUrl.href]: "loading" }));
  };

  const removeImage = (index) => {
    setImagePaths(imageReferences.filter((_, currentIndex) => currentIndex !== index).join("\n"));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (isPending) return;
    setError("");
    if (!categoryId) {
      setError("Choose an active category before saving this product.");
      return;
    }
    if (imageReferences.some((reference) => reference.startsWith("https://") && previewStates[reference] !== "loaded")) {
      setImageMessage("Wait for every remote image preview to load successfully, or remove or replace the unavailable URL.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const payload = {
      id: product?.id,
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      brandName: String(form.get("brand") ?? ""),
      categoryId,
      price: String(form.get("price") ?? ""),
      compareAtPrice: String(form.get("compareAtPrice") ?? ""),
      stockQuantity: Number(form.get("stockQuantity")),
      ingredients: String(form.get("ingredients") ?? ""),
      description: String(form.get("description") ?? ""),
      isActive: form.get("isActive") === "on",
      isBestseller: form.get("isBestseller") === "on",
      images: imagePaths.split("\n").map((path) => path.trim()).filter(Boolean),
    };

    const pricing = validateProductPricing(payload.price, payload.compareAtPrice);
    if (!pricing.ok) {
      setError(pricing.message);
      showToast(pricing.message, "error");
      return;
    }
    payload.price = pricing.price;
    payload.compareAtPrice = pricing.compareAtPrice ?? "";

    startTransition(async () => {
      const result = await saveProduct(payload);
      if (!result.ok) {
        setError(result.message);
        showToast(result.message, "error");
        return;
      }
      showToast(result.message);
      router.refresh();
      onClose?.();
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 text-xs">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="font-semibold text-[var(--color-text)]">Product Name *
          <input name="name" required maxLength={240} defaultValue={product?.name ?? ""} placeholder="e.g. Advanced Retinol Serum" className={inputClass} />
        </label>
        <label className="font-semibold text-[var(--color-text)]">Slug *
          <input name="slug" maxLength={240} defaultValue={product?.slug ?? ""} placeholder="auto-generated from product name" className={inputClass} />
        </label>
        <label className="font-semibold text-[var(--color-text)]">Brand Name *
          <input name="brand" required maxLength={120} defaultValue={product?.brandName ?? ""} placeholder="e.g. Dr. Beauty" className={inputClass} />
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
          />
          <input type="hidden" name="categoryId" value={categoryId} />
        </label>
        <label className="font-semibold text-[var(--color-text)]">Selling Price (EGP) *
          <input name="price" type="number" required min="0" max="9999999999.99" step="0.01" defaultValue={product?.price ?? ""} placeholder="750.00" className={inputClass} />
          <span className="mt-1 block text-[10px] font-normal leading-4 text-[var(--color-text-secondary)]">This is the payable price. When a compare-at price is set, this is shown as the sale price.</span>
        </label>
        <label className="font-semibold text-[var(--color-text)]">Compare-at Price (EGP) (optional)
          <input name="compareAtPrice" type="number" min="0.01" max="9999999999.99" step="0.01" defaultValue={product?.compareAtPrice ?? ""} placeholder="Regular price before sale" className={inputClass} aria-describedby="product-compare-at-help" />
          <span id="product-compare-at-help" className="mt-1 block text-[10px] font-normal leading-4 text-[var(--color-text-secondary)]">Shown crossed out next to the selling price. It must be greater than the selling price.</span>
        </label>
        <label className="font-semibold text-[var(--color-text)]">Stock Quantity *
          <input name="stockQuantity" type="number" required min="0" max="2147483647" step="1" defaultValue={product?.stockQuantity ?? 0} className={inputClass} />
        </label>
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
        <div>
          <label htmlFor="product-image-url" className="block font-semibold text-[var(--color-text)]">Product Images *</label>
          <p className="mt-1 text-[10px] leading-5 text-[var(--color-text-secondary)]">Use an existing local image path or import a public HTTPS URL. Remote images load directly in the customer’s browser; the server does not fetch them.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="product-image-url" type="url" inputMode="url" autoComplete="url" value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); importImageUrl(); } }} disabled={isPending} maxLength={2048} placeholder="https://images.example.com/product.jpg" className={inputClass} />
          <Button type="button" variant="secondary" disabled={isPending || !imageUrl.trim()} onClick={() => importImageUrl()} className="shrink-0">Add URL</Button>
          {imageReferences.length > 0 && <Button type="button" variant="outline" disabled={isPending || !imageUrl.trim()} onClick={() => importImageUrl(true)} className="shrink-0">Replace first</Button>}
        </div>
        {imageMessage && <p role="alert" className="text-xs text-red-700">{imageMessage}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {imageReferences.map((reference, index) => (
            <div key={`${index}-${reference}`} className="space-y-2">
              <div className="relative aspect-square overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                {previewStates[reference] === "error"
                  ? <p role="status" className="flex h-full items-center justify-center p-3 text-center text-[10px] text-[var(--color-text-secondary)]">Image preview unavailable</p>
                  : <Image src={reference} alt={`Product image ${index + 1} preview`} fill unoptimized onLoad={() => { if (reference.startsWith("https://")) setPreviewStates((current) => ({ ...current, [reference]: "loaded" })); }} onError={() => { if (reference.startsWith("https://")) setPreviewStates((current) => ({ ...current, [reference]: "error" })); }} className="object-cover" />}
              </div>
              {reference.startsWith("https://") && previewStates[reference] === "loading" && <p role="status" className="text-[10px] text-[var(--color-text-secondary)]">Loading preview…</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[10px] text-[var(--color-text-secondary)]" title={reference}>{reference}</span>
                <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => removeImage(index)} aria-label={`Remove image ${index + 1}`} className="shrink-0 px-2">Remove</Button>
              </div>
            </div>
          ))}
        </div>
        <label className="block font-semibold text-[var(--color-text)]">Existing Local Image Paths
          <textarea value={imagePaths} onChange={(event) => {
            const value = event.target.value;
            setImagePaths(value);
            const references = value.split("\n").map((reference) => reference.trim());
            setPreviewStates((current) => references.reduce((next, reference) => {
              if (reference.startsWith("https://") && !next[reference]) next[reference] = "loading";
              return next;
            }, { ...current }));
          }} rows={3} disabled={isPending} placeholder="/images/categories/skin-care.jpg" className={textareaClass} aria-describedby="product-image-storage-note" />
        </label>
        <p id="product-image-storage-note" className="text-[10px] leading-5 text-[var(--color-text-secondary)]">Local file upload and drag-and-drop require an approved Supabase Storage bucket and upload policies. That setup is not present, so uploads are disabled rather than stored in a non-persistent browser or server location. Keep one image path or URL per line.</p>
      </div>

      <label className="block font-semibold text-[var(--color-text)]">Key Ingredients
        <input name="ingredients" maxLength={10000} defaultValue={product?.ingredients ?? ""} className={inputClass} />
      </label>
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
