import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";

export async function getCustomerRequestContext(requestType) {
  const route = requestType === "beauty_tips" ? "/beauty-tips" : "/support";
  const missing = getMissingSupabaseEnv();
  if (missing.length) return { status: "unavailable", missing };

  let supabase;
  let user;
  try {
    supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) return { status: "unavailable", missing: [] };
    user = data.user;
  } catch {
    return { status: "unavailable", missing: [] };
  }

  if (!user) redirect(`/login?next=${encodeURIComponent(route)}`);

  const [profileResult, productsResult, ordersResult] = await Promise.all([
    supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
    requestType === "beauty_tips"
      ? supabase.from("products").select("id,name").eq("is_active", true).order("name").limit(100)
      : Promise.resolve({ data: [], error: null }),
    requestType === "support"
      ? supabase.from("orders").select("id,order_number,order_status").eq("user_id", user.id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
  ]);

  return {
    status: "ready",
    email: user.email ?? "",
    phone: profileResult.error ? "" : profileResult.data?.phone ?? "",
    products: productsResult.error ? null : productsResult.data ?? [],
    orders: ordersResult.error ? null : ordersResult.data ?? [],
  };
}
