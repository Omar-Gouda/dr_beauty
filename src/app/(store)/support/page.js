import { Suspense } from "react";
import { BrandLoading } from "@/components/ui/Skeleton";
import CustomerRequestPage from "@/components/requests/CustomerRequestPage";

export const metadata = {
  title: "Customer Support",
  description: "Contact Dr. Beauty about an order, delivery, missing item, or another store question.",
  alternates: { canonical: "/support" },
};

function RequestFallback() {
  return <main className="container section"><div className="mx-auto max-w-3xl"><BrandLoading label="Preparing your support form…" /></div></main>;
}

export default function SupportPage() {
  return <Suspense fallback={<RequestFallback />}><CustomerRequestPage requestType="support" /></Suspense>;
}
