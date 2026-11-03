"use client";

import Image from "next/image";
import { Trash2 } from "lucide-react";
import ProductPrice from "@/components/products/ProductPrice";

export default function CartItem({ item, availabilityStatus, onUpdateQuantity, onRemove }) {
  const itemImage = item.images?.[0] || item.image || "/images/categories/skin-care.jpg";
  const hasProductImage = Boolean(item.images?.[0] || item.image);

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 sm:gap-4 sm:p-4">
      <div className="relative h-20 w-20 rounded-xl overflow-hidden bg-white shrink-0 border border-[var(--color-border)]">
        <Image src={itemImage} alt={item.name} fill unoptimized={!itemImage.startsWith("/")} className={hasProductImage ? "object-contain p-1" : "object-cover"} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[10px] font-bold text-[var(--color-primary)] uppercase">{item.brand}</span>
        <h4 className="font-editorial text-xs font-bold text-[var(--color-text)] line-clamp-1 mb-1">{item.name}</h4>
        <ProductPrice
          price={item.price}
          compareAtPrice={item.compareAtPrice}
          className="mb-2"
          priceClassName="text-xs font-bold text-[var(--color-text)]"
          compareAtClassName="text-[10px] text-[var(--color-text-secondary)]"
        />
        {availabilityStatus === "unavailable" && <p role="status" className="mb-2 text-xs font-semibold text-red-700">This product is no longer available. Remove it to continue.</p>}
        {availabilityStatus === "unverified" && <p role="status" className="mb-2 text-xs font-semibold text-amber-800">Availability could not be verified. Checkout is blocked until it can be checked.</p>}
        {availabilityStatus === "checking" && <p role="status" className="mb-2 text-xs text-[var(--color-text-secondary)]">Checking availability…</p>}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-1">
            <button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => onUpdateQuantity(item.id, item.quantity - 1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-bold hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">-</button>
            <span className="text-xs font-bold">{item.quantity}</span>
            <button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-sm font-bold hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">+</button>
          </div>

          <button type="button" aria-label={`Remove ${item.name} from bag`} onClick={() => onRemove(item.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--color-text-secondary)] transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
