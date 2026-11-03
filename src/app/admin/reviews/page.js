import { Suspense } from "react";
import AdminReviewsManager from "@/components/admin/AdminReviewsManager";
import { getAdminProductReviews } from "@/lib/admin";
import AdminPageLoading from "@/components/admin/AdminPageLoading";

async function AdminReviewsContent() {
  const result = await getAdminProductReviews();
  if (result.error) {
    return <p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">{result.error}</p>;
  }
  return <AdminReviewsManager reviews={result.data} />;
}

export default function AdminReviewsPage() {
  return <Suspense fallback={<AdminPageLoading />}><AdminReviewsContent /></Suspense>;
}
