import { Suspense } from "react";
import { BrandLoading } from "@/components/ui/Skeleton";
import CustomerRequestPage from "@/components/requests/CustomerRequestPage";

function RequestFallback() {
  return <main className="container section"><div className="mx-auto max-w-3xl"><BrandLoading label="Preparing your request form…" /></div></main>;
}

export default function BeautyTipsPage() {
  return <Suspense fallback={<RequestFallback />}><CustomerRequestPage requestType="beauty_tips" /></Suspense>;
}
