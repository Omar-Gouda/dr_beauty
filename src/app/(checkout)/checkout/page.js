import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import CheckoutForm from "./CheckoutForm";
import Container from "@/components/ui/Container";
import { BrandLoading, Skeleton } from "@/components/ui/Skeleton";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { redirectForPolicyAcceptance } from "@/lib/legal/consent-gate";

async function CheckoutContent() {
  if (getMissingSupabaseEnv().length > 0) {
    return <CheckoutForm configurationUnavailable />;
  }

  // Supabase Auth performs time-based token validation. Defer that work until
  // a real request, inside this route's Suspense boundary.
  await connection();
  let supabase;
  let user = null;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (!error) user = data.user;
  } catch {
    user = null;
  }
  if (!user) redirect("/login?next=%2Fcheckout");
  await redirectForPolicyAcceptance(supabase, "/checkout");

  const [profileResult, addressResult, shippingResult] = await Promise.all([
    supabase.from("profiles").select("full_name,phone").eq("id", user.id).maybeSingle(),
    supabase.from("customer_addresses")
      .select("id,recipient_name,phone,governorate,city,address_line,delivery_notes,is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("shipping_settings").select("gift_packaging_fee").eq("id", true).maybeSingle(),
  ]);

  return (
    <CheckoutForm
      initialProfile={profileResult.error ? null : profileResult.data}
      savedAddresses={addressResult.error ? [] : addressResult.data ?? []}
      savedAddressesUnavailable={Boolean(addressResult.error)}
      giftPackagingFee={shippingResult.error ? null : shippingResult.data?.gift_packaging_fee ?? null}
    />
  );
}

function CheckoutFallback() {
  return (
    <main className="section" aria-busy="true" aria-label="Loading checkout">
      <Container className="max-w-4xl space-y-6">
        <p role="status" className="sr-only">Loading checkout…</p>
        <BrandLoading label="Preparing your secure checkout…" />
        <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
          <Skeleton className="h-80 rounded-3xl" />
          <Skeleton className="h-64 rounded-3xl" />
        </div>
      </Container>
    </main>
  );
}

export default function CheckoutPage() {
  return <Suspense fallback={<CheckoutFallback />}><CheckoutContent /></Suspense>;
}
