"use client";

import { useState } from "react";
import Image from "next/image";
import Button from "@/components/ui/Button";
import { formatImageObjectPosition, normalizeImageFocalPoint } from "@/lib/products/product-form.mjs";

export default function ProductImageFocalEditor({ image, index, onChange, onRemove, onPreviewStateChange, disabled = false }) {
  const [hasPreviewError, setHasPreviewError] = useState(false);
  const position = normalizeImageFocalPoint(image);
  const updatePosition = (key, value) => onChange({ ...position, [key]: Number(value) });

  return (
    <article className="min-w-0 space-y-2">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
        {hasPreviewError ? (
          <p role="status" className="flex h-full items-center justify-center p-3 text-center text-xs text-[var(--color-text-secondary)]">This image host could not be reached or does not allow direct image display. Replace it with a publicly accessible direct HTTPS image URL.</p>
        ) : (
          <Image
            src={image.url}
            alt={`Product image ${index + 1} crop preview`}
            fill
            unoptimized
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            onLoad={() => onPreviewStateChange?.("loaded")}
            onError={() => {
              setHasPreviewError(true);
              onPreviewStateChange?.("error");
            }}
            className="object-cover"
            style={{ objectPosition: formatImageObjectPosition(position) }}
          />
        )}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--color-primary)] shadow-md"
          style={{ left: `${position.focal_x}%`, top: `${position.focal_y}%` }}
        />
      </div>
      <p className="break-all text-[10px] leading-4 text-[var(--color-text-secondary)]" title={image.url}>{image.url}</p>
      <label className="block text-[10px] font-medium text-[var(--color-text-secondary)]">
        Horizontal image position <span className="tabular-nums">{position.focal_x}%</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={position.focal_x}
          disabled={disabled}
          aria-label={`Image ${index + 1} horizontal focal position`}
          onChange={(event) => updatePosition("focal_x", event.target.value)}
          className="mt-1 block min-h-8 w-full accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
        />
      </label>
      <label className="block text-[10px] font-medium text-[var(--color-text-secondary)]">
        Vertical image position <span className="tabular-nums">{position.focal_y}%</span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={position.focal_y}
          disabled={disabled}
          aria-label={`Image ${index + 1} vertical focal position`}
          onChange={(event) => updatePosition("focal_y", event.target.value)}
          className="mt-1 block min-h-8 w-full accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
        />
      </label>
      <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onRemove} aria-label={`Remove image ${index + 1}`} className="px-2">
        Remove image
      </Button>
    </article>
  );
}
