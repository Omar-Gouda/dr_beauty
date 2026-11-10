import { Suspense } from "react";
import AdminPromotionsManager from "@/components/admin/AdminPromotionsManager";
import { getAdminPromotions, getAdminShippingSettings } from "@/lib/admin";
import AdminPageLoading from "@/components/admin/AdminPageLoading";
import { getWhatsAppChannelUrl } from "@/lib/whatsapp/channel.mjs";

async function AdminPromotionsContent({ searchParams }) {
  const [result, shippingResult] = await Promise.all([getAdminPromotions(), getAdminShippingSettings()]);
  if (result.error || shippingResult.error) return <p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">{result.error ?? shippingResult.error}</p>;
  const query = await searchParams;
  return <AdminPromotionsManager promotions={result.data} productOptions={result.productOptions} categoryOptions={result.categoryOptions} shippingSettings={shippingResult.data} asOf={new Date().toISOString()} editPromotionId={query?.edit} channelUrl={getWhatsAppChannelUrl()} />;
}

export default function AdminPromotionsPage({ searchParams }) {
  return <Suspense fallback={<AdminPageLoading />}><AdminPromotionsContent searchParams={searchParams} /></Suspense>;
}
