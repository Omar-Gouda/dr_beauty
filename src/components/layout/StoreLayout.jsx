import { Suspense } from "react";
import { connection } from "next/server";
import AnnouncementBar from "@/components/layout/AnnouncementBar";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileBottomNavigation from "@/components/layout/MobileBottomNavigation";
import { getPublicDiscountAnnouncements } from "@/lib/catalog";

async function CurrentAnnouncements() {
  // Active announcement eligibility is evaluated against statement_timestamp()
  // by the public RPC. Wait for the request before constructing the Supabase
  // client or reading that time-dependent result from this streamed subtree.
  await connection();
  const result = await getPublicDiscountAnnouncements();
  return <AnnouncementBar announcements={result.data ?? []} />;
}

function AnnouncementFallback() {
  return <AnnouncementBar loading announcements={[]} />;
}

export default function StoreLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
      <Suspense fallback={<AnnouncementFallback />}><CurrentAnnouncements /></Suspense>

      <Navbar />

      <div className="flex-1">{children}</div>

      <Footer />
      <MobileBottomNavigation />
    </div>
  );
}
