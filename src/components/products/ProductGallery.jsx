"use client";

import { useState } from "react";
import Image from "next/image";
import ProductStockBadge from "@/components/products/ProductStockBadge";
import { getProductImageStateClass } from "@/lib/products/product-image-state.mjs";
import { buildProductGalleryItems } from "@/lib/products/product-gallery.mjs";

export default function ProductGallery({ images = [], imagePositions = [], inStock = null, productName = "Product" }) {
  // Lw mafeesh sowar, nst5dm sora ehteatya
  const galleryImages = images && images.length > 0 ? images : ["/images/categories/skin-care.jpg"];
  const galleryItems = buildProductGalleryItems(galleryImages, imagePositions);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = galleryItems[activeIndex] ?? galleryItems[0];

  return (
    <div className="flex flex-col gap-4">
      {/* Main Active Image Frame */}
      <div className="relative h-[360px] w-full overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm sm:h-[440px] sm:rounded-3xl lg:h-[500px]">
        <Image
          src={activeImage.url}
          alt={productName}
          fill
          unoptimized={!activeImage.url.startsWith("/")}
          className={`object-cover transition-[filter] duration-300 ${getProductImageStateClass(inStock)}`}
          style={{ objectPosition: activeImage.objectPosition }}
        />
        <span className="absolute top-6 left-6 rounded-full bg-[var(--color-primary)] text-white px-4 py-1.5 text-xs font-semibold uppercase tracking-wider shadow-md">
          Dr. Beauty Certified
        </span>
        <ProductStockBadge inStock={inStock} className="absolute bottom-4 left-4" />
      </div>

      {/* Thumbnails Carousel / Grid */}
      {galleryImages.length > 1 && (
        <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
          {galleryItems.map((item, index) => (
            <button
              key={`${index}-${item.url}`}
              type="button"
              aria-label={`Show image ${index + 1} of ${galleryImages.length}`}
              aria-pressed={activeIndex === index}
              onClick={() => setActiveIndex(index)}
              className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-2 transition-all ${
                activeIndex === index
                  ? "border-[var(--color-primary)] scale-105 shadow-md"
                  : "border-[var(--color-border)] opacity-70 hover:opacity-100"
              }`}
            >
              <Image
                src={item.url}
                alt={`${productName} thumbnail ${index + 1}`}
                fill
                unoptimized={!item.url.startsWith("/")}
                className={`object-cover ${getProductImageStateClass(inStock)}`}
                style={{ objectPosition: item.objectPosition }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
