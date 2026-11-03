import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Container from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import CatalogState from "@/components/catalog/CatalogState";
import ProductDetail from "@/components/products/ProductDetail";
import { getCatalogProductBySlug, getCatalogProducts } from "@/lib/catalog";

async function ProductDetailContent({ params }) {
  const { slug } = await params;
  // The server Supabase client inspects the request session; Auth expiry checks
  // also read the current time, so keep this query in request-time rendering.
  await connection();
  const productResult = await getCatalogProductBySlug(slug);

  if (productResult.error) {
    return <CatalogState message="Product details are temporarily unavailable. Please try again later." />;
  }
  if (!productResult.data) notFound();

  const product = productResult.data;
  const relatedResult = await getCatalogProducts({ categoryId: product.categoryId, limit: 4 });
  const relatedProducts = relatedResult.data?.filter((item) => item.id !== product.id).slice(0, 3) ?? [];

  return <ProductDetail product={product} relatedProducts={relatedProducts} />;
}

function ProductDetailFallback() {
  return (
    <main className="section" aria-busy="true" aria-label="Loading product details">
      <Container className="max-w-[1400px] space-y-8">
        <p role="status" className="sr-only">Loading product details…</p>
        <Skeleton className="h-4 w-64 max-w-full" />
        <div className="grid gap-10 lg:grid-cols-2">
          <Skeleton className="aspect-square rounded-3xl" />
          <div className="space-y-5 pt-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-4/5 max-w-full" />
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-14 w-full rounded-full" />
          </div>
        </div>
      </Container>
    </main>
  );
}

export default function ProductDetailPage({ params }) {
  return <Suspense fallback={<ProductDetailFallback />}><ProductDetailContent params={params} /></Suspense>;
}
