import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import Container from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { getCustomerOffers } from "@/lib/catalog";

export const metadata = { title: "Offers & Discount Codes | Dr. Beauty" };

function discountLabel(offer) {
  return offer.discount_type === "percentage"
    ? `${Number(offer.discount_value)}% off`
    : `EGP ${Number(offer.discount_value).toFixed(2)} off`;
}

function dateLabel(value) {
  if (!value) return "No expiry date";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "To be confirmed" : date.toLocaleDateString("en-EG", { dateStyle: "medium", timeZone: "UTC" });
}

async function OffersContent() {
  await connection();
  const result = await getCustomerOffers();
  const discountCodes = result.data?.discountCodes ?? [];
  const freeShipping = result.data?.freeShipping;

  return (
    <main className="container section">
      <header className="mx-auto mb-9 max-w-3xl text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">A little extra for your routine</p>
        <h1 className="section-heading">Beauty offers</h1>
        <p className="section-description">Explore current savings on your beauty essentials. Enter a featured code at checkout, and enjoy free delivery when the offer is available.</p>
      </header>

      {result.error ? (
        <p role="alert" className="mx-auto max-w-3xl rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-sm text-[var(--color-text-secondary)]">Current offers could not be loaded. Please try again later.</p>
      ) : (
        <div className="mx-auto max-w-5xl space-y-6">
          {freeShipping && <article className="rounded-3xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] p-6 shadow-sm sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">A treat on delivery</p>
            <h2 className="mt-2 font-editorial text-2xl font-bold">Free shipping</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">Enjoy free delivery when your eligible product subtotal is above EGP {freeShipping.minimumSubtotal.toFixed(2)}. No code needed.</p>
            <Link href="/shop" className="mt-5 inline-flex min-h-11 items-center rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]">Shop the collection</Link>
          </article>}
          {discountCodes.length === 0 ? <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm sm:p-10">
            <h2 className="font-editorial text-2xl font-bold">No discount codes to share just yet</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">Browse the collection and check back soon for more ways to treat your skin and hair.</p>
            <Link href="/shop" className="mt-6 inline-flex min-h-11 items-center rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]">Shop the collection</Link>
          </section> : <div className="grid gap-5 md:grid-cols-2">
          {discountCodes.map((offer) => (
            <article key={offer.id} className="flex flex-col rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">A little more for less</p>
              <h2 className="mt-2 font-editorial text-2xl font-bold text-[var(--color-text)]">{offer.title}</h2>
              {offer.description && <p className="mt-3 text-sm leading-6 text-[var(--color-text-secondary)]">{offer.description}</p>}
              <p className="mt-5 text-xl font-semibold">{discountLabel(offer)}</p>
              {Number(offer.maximum_discount) > 0 && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Maximum discount EGP {Number(offer.maximum_discount).toFixed(2)}</p>}
              {Number(offer.minimum_subtotal) > 0 && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Eligible on subtotal of at least EGP {Number(offer.minimum_subtotal).toFixed(2)}</p>}
              {offer.maximum_redemptions != null && <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Limited to {offer.maximum_redemptions.toLocaleString("en-EG")} total redemptions</p>}
              <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{offer.starts_at ? `Available ${dateLabel(offer.starts_at)} through ${dateLabel(offer.ends_at)} (UTC)` : `Available through ${dateLabel(offer.ends_at)} (UTC)`}</p>
              <p className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm">Use code <strong className="tracking-wider">{offer.code}</strong> at checkout to enjoy your savings.</p>
              <Link href={offer.target_path} className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--color-primary)] px-6 text-sm font-semibold text-white hover:bg-[var(--color-primary-hover)]">Shop the offer</Link>
            </article>
          ))}
          </div>}
        </div>
      )}
    </main>
  );
}

function OffersFallback() {
  return <main className="container section" aria-busy="true"><div className="mx-auto max-w-5xl space-y-6"><Skeleton className="mx-auto h-28 max-w-2xl rounded-2xl" /><div className="grid gap-5 md:grid-cols-2"><Skeleton className="h-72 rounded-3xl" /><Skeleton className="h-72 rounded-3xl" /></div></div></main>;
}

export default function OffersPage() {
  return <Suspense fallback={<OffersFallback />}><OffersContent /></Suspense>;
}
