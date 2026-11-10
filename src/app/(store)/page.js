import HeroSection from "@/components/home/HeroSection";
import CategoriesSection from "@/components/home/CategoriesSection";
import { Suspense } from "react";
import { connection } from "next/server";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import BenefitsSection from "@/components/home/BenefitsSection";
import PromotionalBanner from "@/components/home/PromotionalBanner";
import NewsletterSection from "@/components/home/NewsletterSection";
import CustomerRankings from "@/components/home/CustomerRankings";
import { getCatalogCategories, getCatalogProducts, getFeaturedPromotions, getPublicStorefrontCustomerRankings, getPublicStorefrontRankingSettings } from "@/lib/catalog";
import Container from "@/components/ui/Container";
import { Skeleton } from "@/components/ui/Skeleton";

export const metadata = {
  title: "Beauty & Skincare with Dr. Radwa Hassan",
  description: "Explore thoughtfully selected skincare and beauty essentials from Dr. Beauty.",
  alternates: { canonical: "/" },
};

async function StoreHomeContent() {
  await connection();
  const [categoryResult, productResult, promotionResult, rankingSettingsResult] = await Promise.all([
    getCatalogCategories(),
    getCatalogProducts({ featured: true, limit: 10 }),
    getFeaturedPromotions(),
    getPublicStorefrontRankingSettings(),
  ]);
  const rankingSettings = rankingSettingsResult.data;
  const rankingsEnabled = rankingSettings.showLovedByDrBeauty || rankingSettings.showDrBeautyElites;
  const rankingResult = rankingsEnabled ? await getPublicStorefrontCustomerRankings() : { data: null, error: false };

  return (
    <div className="flex flex-col w-full">
      {/* 1. Hero Banner Section */}
      <HeroSection />

      {/* 2. Trust Badges / Benefits Section */}
      <BenefitsSection />

      {/* 3. Shop by Category Section */}
      <CategoriesSection categories={categoryResult.data ?? []} error={Boolean(categoryResult.error)} />

      {/* 4. Bestsellers / Featured Products Section */}
      <FeaturedProducts products={productResult.data ?? []} error={Boolean(productResult.error)} />

      {/* 5. Customer rankings use database analytics and remain opt-in by admin. */}
      {rankingsEnabled && <CustomerRankings settings={rankingSettings} rankings={rankingResult.data} />}

      {/* 6. Promotional Banner Section */}
      <PromotionalBanner promotions={promotionResult.data ?? []} />

      {/* 7. Newsletter & Community Section */}
      <NewsletterSection />
    </div>
  );
}
function StoreHomeFallback() {
  return <main className="home-section" aria-busy="true"><Container size="wide" className="space-y-8"><Skeleton className="h-56 rounded-3xl sm:h-80" /><div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="aspect-[4/5] rounded-2xl" />)}</div></Container></main>;
}

export default function Page() {
  return <Suspense fallback={<StoreHomeFallback />}><StoreHomeContent /></Suspense>;
}
