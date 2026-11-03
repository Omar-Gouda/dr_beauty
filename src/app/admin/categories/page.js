import { Suspense } from "react";
import AdminCategoriesManager from "@/components/admin/AdminCategoriesManager";
import { getAdminCategories } from "@/lib/admin";
import AdminPageLoading from "@/components/admin/AdminPageLoading";

async function AdminCategoriesContent() {
  const result = await getAdminCategories();
  if (result.error) return <p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">{result.error}</p>;
  return <AdminCategoriesManager categories={result.data} />;
}

export default function AdminCategoriesPage() {
  return <Suspense fallback={<AdminPageLoading />}><AdminCategoriesContent /></Suspense>;
}
