import { Suspense, cache } from "react";
import { connection } from "next/server";
import Container from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import { notFound } from "next/navigation";
import ProductCard from "@/components/products/ProductCard";
import CatalogState from "@/components/catalog/CatalogState";
import { getCatalogCategoryBySlug, getCatalogProducts } from "@/lib/catalog";

const getCategoryForRoute = cache(getCatalogCategoryBySlug);

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const result = await getCategoryForRoute(slug);
  if (result.error || !result.data) {
    return { title: "Beauty Category", description: "Browse curated skincare and beauty categories at Dr. Beauty.", alternates: { canonical: `/categories/${encodeURIComponent(slug)}` } };
  }
  const category = result.data;
  const description = category.description?.trim() || `Browse ${category.name} products at Dr. Beauty.`;
  return {
    title: category.name,
    description: description.slice(0, 300),
    alternates: { canonical: `/categories/${encodeURIComponent(slug)}` },
    openGraph: { title: category.name, description: description.slice(0, 300), images: category.imageUrl ? [category.imageUrl] : undefined },
    twitter: { card: "summary_large_image", title: category.name, description: description.slice(0, 300), images: category.imageUrl ? [category.imageUrl] : undefined },
  };
}

async function CategoryContent({ params }) {
  const { slug } = await params;
  await connection();
  const categoryResult = await getCategoryForRoute(slug);

  if (categoryResult.error) {
    return <CatalogState message="Categories are temporarily unavailable. Please try again later." />;
  }
  if (!categoryResult.data) notFound();

  const category = categoryResult.data;
  const productResult = await getCatalogProducts({ categoryId: category.id });
  if (productResult.error) {
    return <CatalogState title={category.name} message="Products in this category are temporarily unavailable. Please try again later." />;
  }

  return (
    <main className="container mx-auto min-w-0 px-4 py-8 sm:py-12">
      <h1 className="mb-4 break-words font-editorial text-3xl font-bold text-[var(--color-text)] sm:text-4xl">
        {category.name}
      </h1>
      <p className="text-[var(--color-text-secondary)]">
        {category.description || `Explore our curated collection of ${category.name.toLowerCase()} essentials.`}
      </p>

      {productResult.data.length ? (
        <div className="mt-8 grid min-w-0 grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
          {productResult.data.map((product) => <ProductCard key={product.id} product={product} />)}
        </div>
      ) : (
        <p className="mt-10 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-10 text-center text-sm text-[var(--color-text-secondary)]">
          No active products are available in this category yet.
        </p>
      )}
    </main>
  );
}

function CategoryFallback() {
  return <main className="section" aria-busy="true" aria-label="Loading category"><Container className="space-y-6"><p role="status" className="sr-only">Loading category products…</p><Skeleton className="h-10 w-72 max-w-full" /><Skeleton className="h-5 w-96 max-w-full" /><div className="mt-8 grid min-w-0 grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="aspect-[3/4] rounded-2xl" />)}</div></Container></main>;
}

export default function CategoryPage({ params }) {
  return <Suspense fallback={<CategoryFallback />}><CategoryContent params={params} /></Suspense>;
}
