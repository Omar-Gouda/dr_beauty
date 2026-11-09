import { Suspense } from "react";
import AdminPromotionsManager from "@/components/admin/AdminPromotionsManager";
import { getAdminPromotions, getAdminShippingSettings } from "@/lib/admin";
import AdminPageLoading from "@/components/admin/AdminPageLoading";

async function AdminPromotionsContent() {
  const [result, shippingResult] = await Promise.all([getAdminPromotions(), getAdminShippingSettings()]);
  if (result.error || shippingResult.error) return <p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">{result.error ?? shippingResult.error}</p>;
  return <AdminPromotionsManager promotions={result.data} productOptions={result.productOptions} categoryOptions={result.categoryOptions} shippingSettings={shippingResult.data} />;
}

export default function AdminPromotionsPage() {
  return <Suspense fallback={<AdminPageLoading />}><AdminPromotionsContent /></Suspense>;
}
