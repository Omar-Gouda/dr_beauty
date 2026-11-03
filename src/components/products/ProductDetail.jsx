"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import Container from "@/components/ui/Container";
import ProductCard from "@/components/products/ProductCard";
import ProductGallery from "@/components/products/ProductGallery";
import ProductRating from "@/components/products/ProductRating";
import { fallbackCategoryImage } from "@/data/categoryImages";
import { ShoppingBag, ShieldCheck, Truck, RefreshCw, MessageSquarePlus, Star, Heart } from "lucide-react";
import { useCart } from "@/constants/CartContext";
import { useWishlist } from "@/constants/WishlistContext";
import { useToast } from "@/constants/ToastContext";
import { checkProductAvailability, submitProductReview } from "@/app/(store)/products/actions";
import WhatsAppAction from "@/components/whatsapp/WhatsAppAction";
import { addAvailableProductToCart, isProductAvailableForPurchase } from "@/lib/products/cart-availability.mjs";
import ProductPrice from "@/components/products/ProductPrice";

export default function ProductDetail({ product, relatedProducts = [] }) {
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState("ingredients");
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewState, reviewAction, reviewPending] = useActionState(submitProductReview, null);
  const [checkingStock, setCheckingStock] = useState(false);
  const { addToCart } = useCart();
  const { toggleWishlist, isWishlisted } = useWishlist();
  const { showToast } = useToast();
  const wishlisted = isWishlisted(product.id);
  const productImages = product.images.length ? product.images : [fallbackCategoryImage];

  async function addProductToBag() {
    if (checkingStock || !isProductAvailableForPurchase(product.inStock)) return;
    setCheckingStock(true);
    try {
      const result = await addAvailableProductToCart({
        product,
        checkAvailability: checkProductAvailability,
        addToCart: (availableProduct) => addToCart(availableProduct, quantity),
      });
      if (result.reason === "availability_unverified") showToast("Availability could not be verified. Please try again later.", "error");
      else if (result.reason === "out_of_stock") showToast("This product is currently out of stock.", "error");
      else if (result.ok) showToast(`${product.name} added to your bag`);
      else showToast("This product or quantity is unavailable", "error");
    } catch {
      showToast("Availability could not be verified. Please try again later.", "error");
    } finally {
      setCheckingStock(false);
    }
  }

  return (
    <div className="flex flex-col w-full min-h-screen bg-[var(--color-background)] py-12 sm:py-16">
      <Container className="max-w-[1400px]">
        
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="mb-8 flex min-w-0 flex-wrap items-center gap-2 text-xs text-[var(--color-text-secondary)] sm:text-sm">
          <Link href="/" className="hover:text-[var(--color-primary)] transition-colors">Home</Link>
          <span>/</span>
          <Link href="/shop" className="hover:text-[var(--color-primary)] transition-colors">Shop</Link>
          <span>/</span>
          <span className="min-w-0 break-words font-semibold text-[var(--color-text)]">{product.name}</span>
        </nav>

        {/* Main Product Section */}
        <div className="grid grid-cols-1 items-start gap-6 sm:gap-8 lg:grid-cols-12 lg:gap-16">
          
          {/* Product Gallery */}
          <div className="min-w-0 lg:sticky lg:top-28 lg:col-span-5">
            <ProductGallery images={productImages} productName={product.name} />
          </div>

          {/* Product Info & Actions */}
          <div className="flex min-w-0 flex-col lg:col-span-7">
            
            <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-[var(--color-primary)] uppercase tracking-widest">
                {product.brand}
              </span>
              <ProductRating rating={product.rating} reviews={product.reviews} />
            </div>

            <h1 className="mb-4 break-words font-editorial text-3xl font-bold leading-tight tracking-tight text-[var(--color-text)] sm:text-5xl">
              {product.name}
            </h1>

            <div className="mb-6 flex items-baseline gap-4 border-b border-[var(--color-border)] pb-6">
              <ProductPrice
                price={product.price}
                compareAtPrice={product.compareAtPrice}
                className="gap-x-3"
                priceClassName="text-2xl font-bold text-[var(--color-text)] sm:text-3xl"
                compareAtClassName="text-base text-[var(--color-text-secondary)] sm:text-lg"
                showSaleBadge
              />
            </div>

            <p role="status" className={`-mt-4 mb-5 text-sm font-semibold ${product.inStock === false ? "text-[var(--color-text-secondary)]" : "text-[var(--color-primary)]"}`}>
              {product.inStock === false ? "Out of Stock" : product.inStock === true ? "In Stock" : "Availability will be checked before adding to your bag."}
            </p>

            <p className="text-sm sm:text-base text-[var(--color-text-secondary)] leading-relaxed mb-8">
              {product.description || "Product details will be available soon."}
            </p>

            {/* Quantity Selector & Add to Bag Actions */}
            <div className="mb-8 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:gap-4">
              <div className="flex min-h-12 min-w-0 items-center justify-between rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1 sm:w-36 sm:px-4 sm:py-3">
                <button 
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={quantity <= 1}
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-lg font-bold text-[var(--color-text)] transition-colors hover:text-[var(--color-primary)] disabled:opacity-40"
                >
                  -
                </button>
                <span className="font-bold text-sm text-[var(--color-text)]">{quantity}</span>
                <button 
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setQuantity(Math.min(999, quantity + 1))}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-lg font-bold text-[var(--color-text)] transition-colors hover:text-[var(--color-primary)]"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                onClick={addProductToBag}
                disabled={checkingStock || !isProductAvailableForPurchase(product.inStock)}
                className="col-span-2 row-start-2 inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-3 py-3 text-center text-sm font-semibold text-white shadow-lg shadow-[var(--color-primary)]/25 transition-all hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-1 sm:row-auto sm:min-w-0 sm:flex-1 sm:px-5"
              >
                <ShoppingBag className="h-4 w-4" />
                {checkingStock ? "Checking availability…" : product.inStock === false ? "Out of Stock" : product.inStock === true ? `Add to Bag · EGP ${product.price * quantity}` : "Availability Unavailable"}
              </button>

              <button
                type="button"
                aria-label={wishlisted ? "Remove from Wishlist" : "Add to Wishlist"}
                aria-pressed={wishlisted}
                onClick={() => {
                  if (toggleWishlist(product)) showToast(wishlisted ? "Removed from wishlist" : "Added to wishlist");
                }}
                className="col-start-2 row-start-1 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)] transition-all hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] sm:col-auto sm:row-auto"
              >
                <Heart className={`h-5 w-5 ${wishlisted ? "fill-[var(--color-primary)] text-[var(--color-primary)]" : ""}`} />
              </button>
            </div>

            <div className="-mt-5 mb-8 flex min-w-0 flex-wrap items-center gap-3">
              {product.inStock === false ? (
                <WhatsAppAction templateId="product.restock" variables={{ productName: product.name }} unavailableMessage="WhatsApp availability enquiries are not configured yet.">Ask About Availability</WhatsAppAction>
              ) : (
                <WhatsAppAction templateId="product.question" variables={{ productName: product.name }}>Ask About This Product</WhatsAppAction>
              )}
              {wishlisted && product.inStock === true && (
                <WhatsAppAction templateId="wishlist.back_in_stock" variables={{ productName: product.name }}>Ask About Wishlist Product</WhatsAppAction>
              )}
              <details className="basis-full rounded-2xl border border-[var(--color-border)] px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]">More product help</summary>
                <div className="mt-3 flex flex-wrap gap-3">
                  <WhatsAppAction templateId="product.recommendation" variables={{ productName: product.name }}>Ask for Similar Products</WhatsAppAction>
                  {wishlisted && <WhatsAppAction templateId="wishlist.question" variables={{ productName: product.name }}>Ask About This Wishlist Item</WhatsAppAction>}
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-secondary)]">WhatsApp opens a prepared message for you to review and send. No message is sent automatically.</p>
              </details>
            </div>

            {/* Perks Badges */}
            <div className="mb-8 grid grid-cols-1 gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:grid-cols-3 sm:gap-4 sm:rounded-3xl sm:p-6">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-[var(--color-primary)] shrink-0" />
                <span className="text-xs font-semibold text-[var(--color-text)]">100% Authentic Guaranteed</span>
              </div>
              <div className="flex items-center gap-3">
                <Truck className="h-5 w-5 text-[var(--color-primary)] shrink-0" />
                <span className="text-xs font-semibold text-[var(--color-text)]">Fast Shipping Across Egypt</span>
              </div>
              <div className="flex items-center gap-3">
                <RefreshCw className="h-5 w-5 text-[var(--color-primary)] shrink-0" />
                <span className="text-xs font-semibold text-[var(--color-text)]">Dermatologist Verified</span>
              </div>
            </div>

            {/* Tabs / Info */}
            <div className="flex flex-col border-t border-[var(--color-border)] pt-8">
              <div className="flex flex-wrap gap-4 border-b border-[var(--color-border)] pb-4 sm:gap-6">
                <button
                  type="button"
                  onClick={() => setActiveTab("ingredients")}
                  className={`text-sm font-bold transition-colors pb-1 border-b-2 ${
                    activeTab === "ingredients"
                      ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                      : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                  }`}
                >
                  Key Ingredients
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("usage")}
                  className={`text-sm font-bold transition-colors pb-1 border-b-2 ${
                    activeTab === "usage"
                      ? "border-[var(--color-primary)] text-[var(--color-primary)]"
                      : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                  }`}
                >
                  Product Details
                </button>
              </div>

              <div className="break-words pt-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {activeTab === "ingredients" ? (
                  <p>{product.ingredients || "Ingredient details will be available soon."}</p>
                ) : (
                  <p>{product.description || "Product details will be available soon."}</p>
                )}
              </div>
            </div>

          </div>

        </div>

        {/* Customer Reviews Section */}
        <div className="mt-12 border-t border-[var(--color-border)] pt-8 sm:mt-16 sm:pt-12 lg:mt-24 lg:pt-16">
          <div className="grid grid-cols-1 items-start gap-6 sm:gap-10 lg:grid-cols-12 lg:gap-12">
            
            <div className="lg:col-span-7 flex flex-col">
              <h2 className="font-editorial text-2xl sm:text-3xl font-bold text-[var(--color-text)] mb-6">
                Customer Reviews & Ratings
              </h2>

              <div className="flex items-center gap-6 p-6 rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] mb-8">
                <div className="flex flex-col items-center justify-center pr-6 border-r border-[var(--color-border)]">
                  <span className="font-editorial text-4xl sm:text-5xl font-bold text-[var(--color-text)]">
                    {product.rating == null ? "—" : product.rating.toFixed(1)}
                  </span>
                  <div className="my-1">
                    <ProductRating rating={product.rating} showCount={false} />
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {product.reviews === 0 ? "No reviews yet" : product.reviews == null ? "Ratings unavailable" : `${product.reviews} reviews`}
                  </span>
                </div>
                <div className="flex-1 text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  <p className="font-semibold text-[var(--color-text)] mb-1">Dermatologist Verified Feedback</p>
                  All reviews are submitted by verified buyers who purchased this formula through Dr. Beauty store.
                </div>
              </div>

              <div className="space-y-4">
                {!product.approvedReviewsAvailable ? (
                  <p role="status" className="text-sm text-[var(--color-text-secondary)]">Approved reviews are temporarily unavailable.</p>
                ) : product.approvedReviews.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-secondary)]">No approved reviews have been posted yet.</p>
                ) : product.approvedReviews.map((review) => (
                  <article key={review.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <ProductRating rating={review.rating} reviews={1} showCount={false} />
                      <time dateTime={review.created_at} className="text-xs text-[var(--color-text-secondary)]">
                        {new Date(review.created_at).toLocaleDateString("en-EG", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}
                      </time>
                    </div>
                    {review.title && <h3 className="mt-3 font-semibold text-[var(--color-text)]">{review.title}</h3>}
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-secondary)]">{review.body}</p>
                  </article>
                ))}
              </div>
            </div>

            {/* Write Review Form */}
            <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-8 lg:col-span-5">
              <h3 className="font-editorial text-xl font-bold text-[var(--color-text)] mb-2 flex items-center gap-2">
                <MessageSquarePlus className="h-5 w-5 text-[var(--color-primary)]" />
                Write a Review
              </h3>
              <p className="text-xs text-[var(--color-text-secondary)] mb-6">
                Share your experience with this formula to help fellow skincare enthusiasts.
              </p>

              {reviewState?.ok ? (
                <p role="status" className="rounded-xl bg-[var(--color-primary-light)] p-4 text-sm text-[var(--color-text)]">
                  {reviewState.message}
                </p>
              ) : (
              <form action={reviewAction} className="space-y-4" aria-busy={reviewPending}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="rating" value={reviewRating || ""} />
                {reviewState?.message && (
                  <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                    {reviewState.message}
                    {reviewState.code === "unauthenticated" && (
                      <> <Link href={`/login?next=${encodeURIComponent(`/products/${product.slug}`)}`} className="font-semibold underline">Log in</Link></>
                    )}
                  </p>
                )}
                <div>
                  <p className="mb-1 text-xs font-semibold text-[var(--color-text)]">Rating</p>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button type="button" key={star} aria-label={`Rate ${star} star`} aria-pressed={reviewRating === star} disabled={reviewPending} onClick={() => setReviewRating(star)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--color-warning)] transition-transform hover:scale-105 disabled:opacity-60">
                        <Star className={`h-5 w-5 ${reviewRating >= star ? "fill-[var(--color-warning)]" : ""}`} />
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label htmlFor="review-title" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Review Title (Optional)</label>
                  <input 
                    id="review-title"
                    name="title"
                    type="text" 
                    maxLength={160}
                    disabled={reviewPending}
                    placeholder="Summarize your experience" 
                    className="w-full rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-2.5 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)]"
                  />
                </div>

                <div>
                  <label htmlFor="review-body" className="mb-1 block text-xs font-semibold text-[var(--color-text)]">Your Review</label>
                  <textarea 
                    id="review-body"
                    name="body"
                    required
                    maxLength={5000}
                    disabled={reviewPending}
                    rows="4" 
                    placeholder="Write your feedback..." 
                    className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-xs text-[var(--color-text)] outline-none focus:border-[var(--color-primary)] resize-none"
                  ></textarea>
                </div>

                <button
                  type="submit"
                  disabled={reviewPending || reviewRating === 0}
                  className="w-full rounded-full bg-[var(--color-primary)] py-3 text-xs font-semibold text-white shadow-md shadow-[var(--color-primary)]/20 transition-all hover:bg-[var(--color-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reviewPending ? "Submitting..." : "Submit Review"}
                </button>
              </form>
              )}
            </div>

          </div>
        </div>

        {/* Related Products */}
        {relatedProducts.length > 0 && (
          <div className="mt-12 border-t border-[var(--color-border)] pt-8 sm:mt-16 sm:pt-12 lg:mt-24 lg:pt-16">
            <h2 className="font-editorial text-3xl font-bold text-[var(--color-text)] mb-8">
              Pair With Related Essentials
            </h2>
            <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-3 lg:gap-6">
              {relatedProducts.map((relProduct) => (
                <ProductCard key={relProduct.id} product={relProduct} />
              ))}
            </div>
          </div>
        )}

      </Container>
    </div>
  );
}
