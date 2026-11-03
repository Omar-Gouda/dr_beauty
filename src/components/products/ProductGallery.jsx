"use client";

import { useState } from "react";
import Image from "next/image";

export default function ProductGallery({ images = [], productName = "Product" }) {
  // Lw mafeesh sowar, nst5dm sora ehteatya
  const galleryImages = images && images.length > 0 ? images : ["/images/categories/skin-care.jpg"];
  const [activeImage, setActiveImage] = useState(galleryImages[0]);

  return (
    <div className="flex flex-col gap-4">
      {/* Main Active Image Frame */}
      <div className="relative h-[360px] w-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm sm:h-[440px] sm:rounded-3xl lg:h-[500px]">
        <Image
          src={activeImage}
          alt={productName}
          fill
          unoptimized={!activeImage.startsWith("/")}
          className="object-contain p-5 transition-all duration-300"
        />
        <span className="absolute top-6 left-6 rounded-full bg-[var(--color-primary)] text-white px-4 py-1.5 text-xs font-semibold uppercase tracking-wider shadow-md">
          Dr. Beauty Certified
        </span>
      </div>

      {/* Thumbnails Carousel / Grid */}
      {galleryImages.length > 1 && (
        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
          {galleryImages.map((img, index) => (
            <button
              key={index}
              type="button"
              aria-label={`Show image ${index + 1} of ${galleryImages.length}`}
              aria-pressed={activeImage === img}
              onClick={() => setActiveImage(img)}
              className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 transition-all ${
                activeImage === img
                  ? "border-[var(--color-primary)] scale-105 shadow-md"
                  : "border-[var(--color-border)] opacity-70 hover:opacity-100"
              }`}
            >
              <Image
                src={img}
                alt={`${productName} thumbnail ${index + 1}`}
                fill
                unoptimized={!img.startsWith("/")}
                className="object-contain p-1"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
