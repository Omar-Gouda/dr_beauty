import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site-url.mjs";

function redirectTo(path) {
  return NextResponse.redirect(new URL(path, getSiteUrl()));
}

async function persistSignupPhone(supabase) {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return false;

  const phone = authData.user.user_metadata?.phone;
  if (typeof phone !== "string") return true;
  const normalizedPhone = phone.trim();
  if (normalizedPhone.length < 3 || normalizedPhone.length > 40) return false;

  const { data, error } = await supabase
    .from("profiles")
    .update({ phone: normalizedPhone })
    .eq("id", authData.user.id)
    .select("id")
    .maybeSingle();
  return !error && Boolean(data);
}

export async function GET(request) {
  if (getMissingSupabaseEnv().length) {
    return redirectTo("/login?notice=confirmation-failed");
  }

  const url = new URL(request.url);
  const supabase = await createClient();
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectTo("/login?notice=confirmation-failed");

    const next = url.searchParams.get("next");
    if (next === "/reset-password") return redirectTo("/reset-password");
    const phoneSaved = await persistSignupPhone(supabase);
    if (!phoneSaved) return redirectTo("/profile?notice=profile-incomplete");
    return redirectTo("/profile?notice=welcome");
  }

  if (tokenHash && ["signup", "email", "recovery"].includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return redirectTo("/login?notice=confirmation-failed");
    if (type === "recovery") return redirectTo("/reset-password");
    const phoneSaved = await persistSignupPhone(supabase);
    if (!phoneSaved) return redirectTo("/profile?notice=profile-incomplete");
    return redirectTo("/profile?notice=welcome");
  }

  return redirectTo("/login?notice=confirmation-failed");
}
