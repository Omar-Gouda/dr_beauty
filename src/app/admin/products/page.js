import { Suspense } from "react";
import AdminProductsManager from "@/components/admin/AdminProductsManager";
import { getAdminCategories, getAdminProducts } from "@/lib/admin";
import AdminPageLoading from "@/components/admin/AdminPageLoading";

async function AdminProductsContent() {
  const [productsResult, categoriesResult] = await Promise.all([getAdminProducts(), getAdminCategories()]);
  const error = productsResult.error || categoriesResult.error;
  if (error) return <p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">{error}</p>;
  return <AdminProductsManager products={productsResult.data} categories={categoriesResult.data} />;
}

export default function AdminProductsPage() {
  return <Suspense fallback={<AdminPageLoading variant="products" />}><AdminProductsContent /></Suspense>;
}
