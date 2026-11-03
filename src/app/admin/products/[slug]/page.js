import { Suspense } from "react";
import { notFound } from "next/navigation";
import AdminProductsManager from "@/components/admin/AdminProductsManager";
import { getAdminCategories, getAdminProductBySlug, getAdminProducts } from "@/lib/admin";
import AdminPageLoading from "@/components/admin/AdminPageLoading";

async function AdminProductContent({ params }) {
  const { slug } = await params;
  const [productResult, productsResult, categoriesResult] = await Promise.all([
    getAdminProductBySlug(slug),
    getAdminProducts(),
    getAdminCategories(),
  ]);

  const error = productResult.error || productsResult.error || categoriesResult.error;
  if (error) {
    return (
      <p role="alert" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">
        {error}
      </p>
    );
  }

  if (!productResult.data) notFound();

  const products = productsResult.data.some((product) => product.id === productResult.data.id)
    ? productsResult.data
    : [productResult.data, ...productsResult.data];

  return (
    <AdminProductsManager
      products={products}
      categories={categoriesResult.data}
      initialEditingProduct={productResult.data}
    />
  );
}

export default function AdminProductPage({ params }) {
  return <Suspense fallback={<AdminPageLoading variant="products" />}><AdminProductContent params={params} /></Suspense>;
}
