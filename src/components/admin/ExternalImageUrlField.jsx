"use client";

import Image from "next/image";
import { useState } from "react";
import { validateHttpsImageUrl } from "@/lib/image-url.mjs";

const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm font-normal text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";

export default function ExternalImageUrlField({
  id,
  value,
  onChange,
  disabled = false,
  alt = "Category image preview",
}) {
  const [preview, setPreview] = useState({ value: "", state: "empty" });
  const validation = value ? validateHttpsImageUrl(value) : null;
  const previewState = !value ? "empty" : !validation?.ok ? "invalid" :
    preview.value === value ? preview.state : "loading";

  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-[var(--color-text)]">
        Upload image using URL (Preferable)
      </label>
      <input
        id={id}
        name="imageUrl"
        type="url"
        inputMode="url"
        autoComplete="url"
        maxLength={2048}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setPreview({ value: event.target.value, state: "loading" });
        }}
        disabled={disabled}
        placeholder="https://images.example.com/category.jpg"
        aria-describedby={`${id}-help ${id}-status`}
        className={inputClass}
      />
      <p id={`${id}-help`} className="mt-1 text-xs font-normal text-[var(--color-text-secondary)]">
        Upload your image to an external image host first, then paste its direct HTTPS image URL here. The site displays the image directly and does not upload or proxy it.
      </p>
      <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
        {(previewState === "loading" || previewState === "loaded") && validation?.ok && (
          <div className="relative aspect-[16/9]">
            <Image
              src={validation.value}
              alt={alt}
              fill
              unoptimized
              sizes="(max-width: 640px) 100vw, 32rem"
              className="object-cover"
              onLoad={() => setPreview({ value, state: "loaded" })}
              onError={() => setPreview({ value, state: "failed" })}
            />
          </div>
        )}
        {previewState === "loaded" && <p className="px-3 py-2 text-xs text-[var(--color-success)]">Image preview loaded.</p>}
        {previewState === "empty" && <p className="p-4 text-xs text-[var(--color-text-secondary)]">No custom image. The current category artwork will be used.</p>}
        {previewState === "invalid" && <p className="p-4 text-xs text-[var(--color-warning)]">Enter a valid public HTTPS image URL to preview it.</p>}
        {previewState === "failed" && <p className="p-4 text-xs text-[var(--color-warning)]">Preview unavailable. The host may block embedding or the URL may not point to a supported image. Try a public direct-image URL, or leave this field empty to use the current category artwork.</p>}
        {previewState === "loading" && <p className="p-3 text-xs text-[var(--color-text-secondary)]">Loading image preview…</p>}
      </div>
      <span className="sr-only" id={`${id}-status`} aria-live="polite">
        {previewState === "loaded" ? "Image preview loaded." :
          previewState === "invalid" ? "Enter a valid HTTPS image URL." :
            previewState === "failed" ? "Image preview unavailable." :
              previewState === "loading" ? "Loading image preview." : "No custom image selected."}
      </span>
    </div>
  );
}
