"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import Container from "@/components/ui/Container";
import ProductCard from "@/components/products/ProductCard";
import { useEffect, useState } from "react";
import { useWishlist } from "@/constants/WishlistContext";
import { getProductAvailability } from "@/app/(store)/products/actions";

export default function WishlistPage() {
  const { wishlistItems } = useWishlist();
  const [availability, setAvailability] = useState({ key: "", values: {} });
  const wishlistKey = wishlistItems.map((product) => product.id).join(",");

  useEffect(() => {
    let current = true;
    const productIds = wishlistKey ? wishlistKey.split(",") : [];
    if (productIds.length) {
      getProductAvailability(productIds).then((result) => {
        if (current && result.verified) setAvailability({ key: wishlistKey, values: result.availability });
      }).catch(() => {});
    }
    return () => { current = false; };
  }, [wishlistKey]);

  return (
    <div className="flex min-h-screen min-w-0 flex-col bg-[var(--color-background)] py-8 sm:py-16">
      <Container className="max-w-[1400px]">
        <div className="mb-6 flex min-w-0 items-center gap-3 sm:mb-8">
          <Heart className="h-7 w-7 text-[var(--color-primary)]" />
          <h1 className="min-w-0 break-words font-editorial text-2xl font-bold text-[var(--color-text)] sm:text-4xl">
            My Wishlist ({wishlistItems.length})
          </h1>
        </div>

        {wishlistItems.length > 0 ? (
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
            {wishlistItems.map((product) => <ProductCard key={product.id} product={{ ...product, inStock: availability.key === wishlistKey ? availability.values[product.id] ?? null : null }} />)}
          </div>
        ) : (
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-12 text-center">
            <Heart className="mx-auto mb-3 h-12 w-12 text-[var(--color-border)]" />
            <h2 className="mb-2 font-editorial text-xl font-bold text-[var(--color-text)]">Your wishlist is empty</h2>
            <p className="mb-6 text-sm text-[var(--color-text-secondary)]">Save your favorite products here to find them again.</p>
            <Link href="/shop" className="inline-flex rounded-full bg-[var(--color-primary)] px-6 py-3 text-xs font-semibold text-white shadow-md">
              Explore the shop
            </Link>
          </div>
        )}
      </Container>
    </div>
  );
}
