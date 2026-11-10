import { Suspense } from "react";
import { connection } from "next/server";
import AnnouncementBar from "@/components/layout/AnnouncementBar";
import SessionAwareNavbar from "@/components/layout/SessionAwareNavbar";
import Footer from "@/components/layout/Footer";
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

export function StoreAnnouncement() {
  return <Suspense fallback={<AnnouncementFallback />}><CurrentAnnouncements /></Suspense>;
}

export default function StoreLayout({ children, desktopChromeOnly = false }) {
  return (
    <div className={desktopChromeOnly ? "flex flex-col lg:min-h-screen" : "flex min-h-screen flex-col"}>
      {!desktopChromeOnly && <StoreAnnouncement />}

      <SessionAwareNavbar desktopOnly={desktopChromeOnly} />

      <div className="flex-1">{children}</div>

      <Footer desktopOnly={desktopChromeOnly} />
    </div>
  );
}
