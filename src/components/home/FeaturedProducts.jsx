"use client";

import Link from "next/link";
import Image from "next/image";
import Container from "@/components/ui/Container";
import SectionHeading from "@/components/ui/SectionHeading";
import ProductRating from "@/components/products/ProductRating";
import { fallbackCategoryImage } from "@/data/categoryImages";
import { Heart, ShoppingBag } from "lucide-react";
import { useCart } from "@/constants/CartContext";
import { useWishlist } from "@/constants/WishlistContext";
import { useToast } from "@/constants/ToastContext";
import { useState } from "react";
import { checkProductAvailability } from "@/app/(store)/products/actions";
import { addAvailableProductToCart, isProductAvailableForPurchase } from "@/lib/products/cart-availability.mjs";
import WhatsAppAction from "@/components/whatsapp/WhatsAppAction";
import ProductPrice from "@/components/products/ProductPrice";
import ProductStockBadge from "@/components/products/ProductStockBadge";
import { getProductImageStateClass } from "@/lib/products/product-image-state.mjs";

export default function FeaturedProducts({ products, error }) {
  const { addToCart } = useCart();
  const { toggleWishlist, isWishlisted } = useWishlist();
  const { showToast } = useToast();
  const [checkingProductId, setCheckingProductId] = useState(null);

  async function addProductToBag(product) {
    if (checkingProductId) return;
    setCheckingProductId(product.id);
    const result = await addAvailableProductToCart({
      product,
      checkAvailability: checkProductAvailability,
      addToCart,
    });

    if (result.ok) showToast(`${product.name} added to your bag`);
    else if (result.reason === "out_of_stock") showToast("This product is currently out of stock.", "error");
    else if (result.reason === "cart_rejected") showToast("This product or quantity is unavailable", "error");
    else showToast("Availability could not be verified. Please try again later.", "error");
    setCheckingProductId(null);
  }
  return (
    <section className="home-section bg-[var(--color-surface)]">
      <Container size="wide">
        <div className="mb-4 flex items-end justify-between gap-3 sm:mb-8">
          <SectionHeading eyebrow="Bestsellers" title="Customer Favorites" align="left" className="min-w-0 flex-1" />
          <Link
            href="/shop"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary)] transition-colors hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
          >
            View All →
          </Link>
        </div>

        {error ? (
          <p role="status" className="rounded-2xl border border-[var(--color-border)] px-5 py-8 text-center text-sm text-[var(--color-text-secondary)]">
            Featured products are temporarily unavailable. Please try again later.
          </p>
        ) : products.length === 0 ? (
          <p className="rounded-2xl border border-[var(--color-border)] px-5 py-8 text-center text-sm text-[var(--color-text-secondary)]">
            No featured products are available yet.
          </p>
        ) : (
          <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4 2xl:grid-cols-5">
            {products.map((product) => (
              <div
                key={product.id}
                className="group relative flex min-w-0 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 transition-all hover:shadow-md sm:p-4"
              >
                <button
                  type="button"
                  aria-label={isWishlisted(product.id) ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
                  aria-pressed={isWishlisted(product.id)}
                  onClick={() => {
                    const wasWishlisted = isWishlisted(product.id);
                    if (toggleWishlist(product)) showToast(wasWishlisted ? "Removed from wishlist" : "Added to wishlist");
                  }}
                  className="absolute right-4 top-4 z-10 inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-[var(--color-surface)]/90 text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
                >
                  <Heart className={`h-5 w-5 ${isWishlisted(product.id) ? "fill-[var(--color-primary)] text-[var(--color-primary)]" : ""}`} />
                </button>

                <Link href={`/products/${product.slug}`} className="relative mb-4 flex aspect-[4/5] w-full items-center justify-center overflow-hidden rounded-xl bg-[var(--color-primary-light)]">
                  <Image
                    src={product.images[0] ?? fallbackCategoryImage}
                    alt={product.name}
                    fill
                    unoptimized={!(product.images[0] ?? fallbackCategoryImage).startsWith("/")}
                    className={`object-cover transition-[filter,transform] duration-300 group-hover:scale-105 ${getProductImageStateClass(product.inStock)}`}
                    style={{ objectPosition: product.imagePositions?.[0] ?? "50% 50%" }}
                  />
                  <ProductStockBadge inStock={product.inStock} className="absolute bottom-3 left-3" />
                </Link>

                <div className="flex flex-1 flex-col">
                <div className="mb-2">
                  <ProductRating rating={product.rating} reviews={product.reviews} />
                </div>

                <Link href={`/products/${product.slug}`} className="mb-2 min-w-0 break-words font-editorial text-sm font-bold text-[var(--color-text)] line-clamp-2 transition-colors hover:text-[var(--color-primary)] sm:text-base">
                  {product.name}
                </Link>

                <div className="mt-auto flex flex-col items-stretch gap-2 border-t border-[var(--color-border)] pt-3">
                  <ProductPrice
                    price={product.price}
                    compareAtPrice={product.compareAtPrice}
                    currency={product.currency}
                    className="font-sans"
                    priceClassName="font-bold text-[var(--color-text)]"
                    compareAtClassName="text-xs text-[var(--color-text-secondary)]"
                    showSaleBadge
                  />
                  <button
                    type="button"
                    aria-label={`Add ${product.name} to bag`}
                    onClick={() => addProductToBag(product)}
                    disabled={Boolean(checkingProductId) || !isProductAvailableForPurchase(product.inStock)}
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[var(--color-primary)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {checkingProductId === product.id ? "Checking…" : product.inStock === false ? "Out of Stock" : product.inStock === true ? "Add to Bag" : "Availability Unavailable"}
                  </button>
                </div>
                {product.inStock === null && <p role="status" className="mt-3 text-xs text-[var(--color-text-secondary)]">Availability could not be verified, so this item cannot be added right now.</p>}
                {product.inStock === false && <WhatsAppAction className="mt-3 w-full" templateId="product.availability" variables={{ productName: product.name }} unavailableMessage="WhatsApp availability enquiries are not configured yet.">Ask About Availability</WhatsAppAction>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
