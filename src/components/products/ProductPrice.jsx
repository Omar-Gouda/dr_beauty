import { getProductPricing } from "@/lib/products/pricing.mjs";

function formatAmount(value, currency) {
  return `${currency} ${value.toLocaleString("en-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ProductPrice({
  price,
  compareAtPrice = null,
  currency = "EGP",
  className = "",
  priceClassName = "",
  compareAtClassName = "",
  showSaleBadge = false,
}) {
  const pricing = getProductPricing(price, compareAtPrice);
  if (pricing.price === null) return null;
  const sellingPriceText = formatAmount(pricing.price, currency);

  return (
    <span className={`flex flex-wrap items-baseline gap-x-2 gap-y-1 ${className}`}>
      <span className={priceClassName} aria-label={`${pricing.hasCompareAtPrice ? "Sale price" : "Price"}: ${sellingPriceText}`}>
        {sellingPriceText}
      </span>
      {pricing.hasCompareAtPrice && (
        <>
          <del className={compareAtClassName} aria-label={`Regular price: ${formatAmount(pricing.compareAtPrice, currency)}`}>
            {formatAmount(pricing.compareAtPrice, currency)}
          </del>
          {showSaleBadge && (
            <span className="rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[10px] font-semibold text-[var(--color-primary)]">
              Sale
            </span>
          )}
        </>
      )}
    </span>
  );
}
