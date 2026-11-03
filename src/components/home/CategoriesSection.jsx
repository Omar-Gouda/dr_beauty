import Link from "next/link";
import Image from "next/image";
import Container from "@/components/ui/Container";
import SectionHeading from "@/components/ui/SectionHeading";
import { categoryImages, fallbackCategoryImage } from "@/data/categoryImages";

export default function CategoriesSection({ categories, error }) {
  return (
    <section id="categories" className="home-section scroll-mt-24">
      <Container size="wide">
        <div className="mb-4 flex items-end justify-between gap-2 sm:mb-8 sm:gap-3">
          <SectionHeading eyebrow="Explore Collections" title="Shop by Category" align="left" className="min-w-0 flex-1" />
          <Link
            href="/shop"
            className="inline-flex min-h-11 shrink-0 items-center text-sm font-semibold text-[var(--color-primary)] transition-colors hover:underline focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
          >
            View All →
          </Link>
        </div>

        {error ? (
          <p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-8 text-center text-sm text-[var(--color-text-secondary)]">
            Categories are temporarily unavailable. Please try again later.
          </p>
        ) : categories.length === 0 ? (
          <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-8 text-center text-sm text-[var(--color-text-secondary)]">
            No active categories are available yet.
          </p>
        ) : (
          <div className="flex min-w-0 flex-wrap justify-center gap-y-4 sm:gap-y-5 md:gap-y-6 lg:grid lg:grid-cols-7 lg:gap-6">
            {categories.map((category) => {
              const image = categoryImages[category.slug] ?? fallbackCategoryImage;
              return (
                <Link
                  key={category.id}
                  href={`/categories/${category.slug}`}
                  className="group flex basis-1/4 min-w-0 flex-col items-center text-center md:basis-1/5 lg:basis-auto"
                >
                  <div className="relative mb-1.5 h-16 w-16 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-primary-light)] shadow-sm transition-transform duration-300 group-hover:scale-105 sm:mb-3 sm:h-20 sm:w-20 md:h-24 md:w-24 lg:h-36 lg:w-36">
                    <Image
                      src={image}
                      alt={category.name}
                      fill
                      unoptimized={!image.startsWith("/")}
                      className="object-cover transition-transform duration-300 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-black/10 transition-colors group-hover:bg-black/0" />
                  </div>
                  <span className="max-w-full break-words text-xs font-semibold leading-snug text-[var(--color-text)] transition-colors group-hover:text-[var(--color-primary)] sm:text-sm">
                    {category.name} →
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </Container>
    </section>
  );
}
