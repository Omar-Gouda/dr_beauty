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
  showPreview = true,
  label = "Upload image using URL (Preferable)",
  className = "",
  error = "",
  previewAspectClassName = "aspect-square",
  previewClassName = "",
  helperText = "Upload your image to an external image host first, then paste its direct HTTPS image URL here. The site displays the image directly and does not upload or proxy it.",
  onPreviewStateChange,
}) {
  const [preview, setPreview] = useState({ value: "", state: "empty" });
  const validation = value ? validateHttpsImageUrl(value) : null;
  const previewState = !value ? "empty" : !validation?.ok ? "invalid" :
    preview.value === value ? preview.state : "loading";

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-semibold text-[var(--color-text)]">
        {label}
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
          const nextValue = event.target.value;
          onChange(nextValue);
          const nextValidation = nextValue ? validateHttpsImageUrl(nextValue) : null;
          const nextState = !nextValue ? "empty" : nextValidation?.ok ? "loading" : "invalid";
          setPreview({ value: nextValue, state: nextState });
          onPreviewStateChange?.(nextState, nextValue);
        }}
        disabled={disabled}
        placeholder="https://images.example.com/category.jpg"
        aria-invalid={Boolean(error || previewState === "invalid" || previewState === "failed")}
        aria-describedby={`${id}-help ${id}-status${error ? ` ${id}-error` : ""}`}
        className={inputClass}
      />
      {error && <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      <p id={`${id}-help`} className="mt-1 text-xs font-normal text-[var(--color-text-secondary)]">
        {helperText}
      </p>
      {showPreview && <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]">
        {(previewState === "loading" || previewState === "loaded") && validation?.ok && (
          <div className={`relative ${previewAspectClassName} ${previewClassName}`.trim()}>
            <Image
              src={validation.value}
              alt={alt}
              fill
              unoptimized
              sizes="(max-width: 640px) 100vw, 32rem"
              className="object-cover"
              onLoad={() => {
                setPreview({ value, state: "loaded" });
                onPreviewStateChange?.("loaded", value);
              }}
              onError={() => {
                setPreview({ value, state: "failed" });
                onPreviewStateChange?.("failed", value);
              }}
            />
          </div>
        )}
        {previewState === "loaded" && <p className="px-3 py-2 text-xs text-[var(--color-success)]">Image preview loaded.</p>}
        {previewState === "empty" && <p className="p-4 text-xs text-[var(--color-text-secondary)]">No custom image. The current category artwork will be used.</p>}
        {previewState === "invalid" && <p className="p-4 text-xs text-[var(--color-warning)]">Enter a valid public HTTPS image URL to preview it.</p>}
        {previewState === "failed" && <p className="p-4 text-xs text-[var(--color-warning)]">Preview unavailable. The image host may be inaccessible, block direct image display, or the URL may not point to an image. Try a public direct-image URL from another accessible host, or leave this field empty to use the current category artwork.</p>}
        {previewState === "loading" && <p className="p-3 text-xs text-[var(--color-text-secondary)]">Loading image preview…</p>}
      </div>}
      <span className="sr-only" id={`${id}-status`} aria-live="polite">
        {!showPreview ? (validation?.ok ? "Valid public HTTPS image URL." : value ? "Enter a valid HTTPS image URL." : "No custom image selected.") :
          previewState === "loaded" ? "Image preview loaded." :
          previewState === "invalid" ? "Enter a valid HTTPS image URL." :
            previewState === "failed" ? "Image preview unavailable." :
              previewState === "loading" ? "Loading image preview." : "No custom image selected."}
      </span>
    </div>
  );
}
