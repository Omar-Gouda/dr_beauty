import { Suspense } from "react";
import { connection } from "next/server";
import Container from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";
import ShopCatalog from "@/components/products/ShopCatalog";
import CatalogState from "@/components/catalog/CatalogState";
import { getCatalogBrands, getCatalogCategories, getCatalogShopProducts } from "@/lib/catalog";
import { normalizeCatalogPageRequest } from "@/lib/catalog-pagination.mjs";

async function ShopCatalogFromUrl({ searchParams }) {
  const params = await searchParams;
  await connection();
  const [categoryResult, brandResult] = await Promise.all([
    getCatalogCategories(),
    getCatalogBrands(),
  ]);

  if (categoryResult.error || brandResult.error) {
    return (
      <CatalogState message="The product catalog is temporarily unavailable. Please try again later." />
    );
  }

  const filters = normalizeCatalogPageRequest(params, {
    categories: categoryResult.data,
    brands: brandResult.data,
  });
  const productResult = await getCatalogShopProducts(filters);
  if (productResult.error) {
    return <CatalogState message="The product catalog is temporarily unavailable. Please try again later." />;
  }

  return (
    <ShopCatalog
      key={JSON.stringify(filters)}
      products={productResult.data}
      categories={categoryResult.data}
      brands={brandResult.data}
      filters={filters}
      pagination={productResult.pagination}
      ratingsAvailable={productResult.ratingsAvailable}
    />
  );
}

export default function ShopPage({ searchParams }) {
  return (
    <Suspense fallback={<ShopCatalogFallback />}>
      <ShopCatalogFromUrl searchParams={searchParams} />
    </Suspense>
  );
}

function ShopCatalogFallback() {
  return <main className="section" aria-busy="true"><Container size="wide" className="space-y-8"><Skeleton className="h-56 rounded-3xl sm:h-72" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4 2xl:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="aspect-[4/5] rounded-2xl" />)}</div></Container></main>;
}
