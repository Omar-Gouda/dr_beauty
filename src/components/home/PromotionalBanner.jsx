import Link from "next/link";
import Container from "@/components/ui/Container";

export default function PromotionalBanner({ promotions = [] }) {
  if (promotions.length === 0) return null;

  return (
    <section className="home-section bg-[var(--color-background)]" aria-label="Featured discount codes">
      <Container size="wide">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,32rem),1fr))] gap-5">
          {promotions.map((promotion) => (
            <article key={promotion.id} className="flex min-w-0 flex-col items-start rounded-3xl border border-[var(--color-border)] bg-[var(--color-primary-light)] p-4 sm:p-9">
              <span className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--color-primary)]">Featured discount code</span>
              <h2 className="mb-3 break-words font-editorial text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{promotion.title}</h2>
              {promotion.description && <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">{promotion.description}</p>}
              <p className="mb-4 text-sm font-semibold text-[var(--color-text)]">
                {promotion.discount_type === "percentage" ? `${Number(promotion.discount_value)}% off` : `EGP ${Number(promotion.discount_value).toFixed(2)} off`}
                {Number(promotion.minimum_subtotal) > 0 && ` · Minimum subtotal EGP ${Number(promotion.minimum_subtotal).toFixed(2)}`}
                {promotion.maximum_discount != null && ` · Maximum EGP ${Number(promotion.maximum_discount).toFixed(2)}`}
              </p>
              <p className="mb-5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-semibold text-[var(--color-text)]">Use code <span className="tracking-wider">{promotion.code}</span></p>
              <Link href={promotion.target_path} className="mt-auto inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-6 py-3 text-sm font-semibold text-white shadow-md transition-colors hover:bg-[var(--color-primary-hover)]">Shop this code <span aria-hidden="true">→</span></Link>
            </article>
          ))}
        </div>
      </Container>
    </section>
  );
}
