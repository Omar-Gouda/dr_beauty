"use client";

import Link from "next/link";
import Image from "next/image";
import { Heart, ShoppingBag, Star } from "lucide-react";
import { useCart } from "@/constants/CartContext";
import { useWishlist } from "@/constants/WishlistContext";
import { useToast } from "@/constants/ToastContext";
import { useState } from "react";
import { checkProductAvailability } from "@/app/(store)/products/actions";
import WhatsAppAction from "@/components/whatsapp/WhatsAppAction";
import { addAvailableProductToCart, isProductAvailableForPurchase } from "@/lib/products/cart-availability.mjs";
import ProductPrice from "@/components/products/ProductPrice";

export default function ProductCard({ product }) {
  const { addToCart } = useCart();
  const { toggleWishlist, isWishlisted } = useWishlist();
  const { showToast } = useToast();
  const [checkingStock, setCheckingStock] = useState(false);
  const wishlisted = isWishlisted(product.id);
  // استخراج الصورة بشكل آمن سواء كانت image أو أول عنصر في images array
  const productImage = product.images && product.images.length > 0 
    ? product.images[0] 
    : product.image || "/images/categories/skin-care.jpg";
  const hasProductImage = Boolean(product.images?.length || product.image);
  async function addProductToBag() {
    if (checkingStock || !isProductAvailableForPurchase(product.inStock)) return;
    setCheckingStock(true);
    try {
      const result = await addAvailableProductToCart({
        product,
        checkAvailability: checkProductAvailability,
        addToCart,
      });
      if (result.reason === "availability_unverified") {
        showToast("Availability could not be verified. Please try again later.", "error");
      } else if (result.reason === "out_of_stock") {
        showToast("This product is currently out of stock.", "error");
      } else if (result.ok) {
        showToast(`${product.name} added to your bag`);
      } else {
        showToast("This product or quantity is unavailable", "error");
      }
    } catch {
      showToast("Availability could not be verified. Please try again later.", "error");
    } finally {
      setCheckingStock(false);
    }
  }

  return (
    <div className={`group relative flex min-w-0 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition-all duration-300 hover:shadow-xl hover:shadow-[var(--color-primary)]/5 sm:rounded-3xl sm:p-5 ${product.inStock === false ? "opacity-70" : ""}`}>
      <button
        type="button"
        aria-label={wishlisted ? "Remove from Wishlist" : "Add to Wishlist"}
        aria-pressed={wishlisted}
        onClick={() => {
          if (toggleWishlist(product)) showToast(wishlisted ? "Removed from wishlist" : "Added to wishlist");
        }}
        className="absolute right-6 top-6 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[var(--color-background)] text-[var(--color-text-secondary)] shadow-sm transition-all hover:text-[var(--color-primary)] hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
      >
        <Heart className={`h-4 w-4 ${wishlisted ? "fill-[var(--color-primary)] text-[var(--color-primary)]" : ""}`} />
      </button>

      <Link href={`/products/${product.slug}`} className="relative mb-3 flex aspect-[4/5] w-full min-w-0 items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] transition-colors group-hover:border-[var(--color-primary)]/30 sm:mb-5 sm:rounded-2xl">
        <Image
          src={productImage}
          alt={product.name}
          fill
          unoptimized={!productImage.startsWith("/")}
          className={`transition-transform duration-300 group-hover:scale-105 ${hasProductImage ? "object-contain p-2" : "object-cover"}`}
        />
        {product.inStock === false && <span className="absolute bottom-3 left-3 rounded-full bg-[var(--color-text)] px-3 py-1.5 text-[10px] font-semibold text-white">Out of Stock</span>}
      </Link>

      <div className="mb-1 flex min-w-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">
          {product.categoryName}
        </span>
        <span className="min-w-0 truncate text-right text-[11px] font-medium text-[var(--color-text-secondary)]">
          {product.brand}
        </span>
      </div>

      <div className="mb-2 flex min-w-0 items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
        <Star className="h-3.5 w-3.5 fill-[var(--color-warning)] text-[var(--color-warning)]" />
        <span className="font-bold text-[var(--color-text)]">{product.rating}</span>
        <span className="truncate">({product.reviews} reviews)</span>
      </div>

      <Link href={`/products/${product.slug}`} className="mb-3 min-w-0 break-words font-editorial text-sm font-bold text-[var(--color-text)] line-clamp-2 transition-colors hover:text-[var(--color-primary)] sm:mb-4 sm:text-lg">
        {product.name}
      </Link>

      {product.inStock === null && <p className="mb-3 text-xs text-[var(--color-text-secondary)]">Availability is temporarily unavailable.</p>}

      <div className="mt-auto flex flex-col items-stretch gap-3 border-t border-[var(--color-border)] pt-4">
        <ProductPrice
          price={product.price}
          compareAtPrice={product.compareAtPrice}
          className="font-sans"
          priceClassName="text-base font-bold text-[var(--color-text)]"
          compareAtClassName="text-xs text-[var(--color-text-secondary)]"
          showSaleBadge
        />
        <button
          type="button"
          onClick={addProductToBag}
          disabled={checkingStock || !isProductAvailableForPurchase(product.inStock)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 py-2.5 text-xs font-semibold text-white shadow-md shadow-[var(--color-primary)]/20 transition-all hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <ShoppingBag className="h-3.5 w-3.5" />
          {checkingStock ? "Checking…" : product.inStock === false ? "Out of Stock" : product.inStock === true ? "Add to Bag" : "Availability Unavailable"}
        </button>
      </div>
      {product.inStock === false && <WhatsAppAction className="mt-3 w-full" templateId="product.availability" variables={{ productName: product.name }} unavailableMessage="WhatsApp availability enquiries are not configured yet." >Ask About Availability</WhatsAppAction>}
    </div>
  );
}
