"use client";

import { ShoppingBag } from "lucide-react";
import Link from "next/link";

export default function EmptyCart({ onClose }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center py-12">
      <ShoppingBag className="h-12 w-12 text-[var(--color-border)] mb-3" />
      <p className="font-editorial text-base font-bold text-[var(--color-text)] mb-1">Your bag is empty</p>
      <p className="text-xs text-[var(--color-text-secondary)] mb-6">Explore our catalog and add your clinical skincare essentials.</p>
      <Link
        href="/shop"
        onClick={onClose}
        className="rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-xs font-semibold text-white shadow-md"
      >
        Shop Catalog
      </Link>
    </div>
  );
}