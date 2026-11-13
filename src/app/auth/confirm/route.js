import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { getSiteUrl } from "@/lib/site-url.mjs";
import {
  createRecoveryProof,
  getRecoveryProofSecret,
  RECOVERY_PROOF_COOKIE,
  recoveryProofCookieOptions,
} from "@/lib/auth/recovery-proof.server.mjs";

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

async function establishRecoveryProof(supabase, accessToken) {
  const secret = getRecoveryProofSecret();
  if (!secret || typeof accessToken !== "string") return false;
  const { data: { claims }, error: claimsError } = await supabase.auth.getClaims(accessToken);
  if (claimsError || !Array.isArray(claims?.amr) || !claims.amr.some((method) => method?.method === "recovery")) {
    return false;
  }
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || claims.sub !== user.id) return false;
  const proof = createRecoveryProof(user.id, secret);
  if (!proof) return false;
  let registration;
  try {
    registration = await supabase.rpc("register_auth_recovery_proof", {
      p_nonce_digest: proof.nonceDigest,
      p_expires_at: new Date(proof.expiresAt * 1000).toISOString(),
    });
  } catch {
    return false;
  }
  if (registration.error || registration.data !== true) return false;
  const cookieStore = await cookies();
  cookieStore.set(RECOVERY_PROOF_COOKIE, proof.value, recoveryProofCookieOptions());
  return true;
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
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirectTo("/login?notice=confirmation-failed");

    const next = url.searchParams.get("next");
    if (next === "/reset-password") {
      if (!(await establishRecoveryProof(supabase, data?.session?.access_token))) {
        return redirectTo("/login?notice=recovery-failed");
      }
      return redirectTo("/reset-password");
    }
    const phoneSaved = await persistSignupPhone(supabase);
    if (!phoneSaved) return redirectTo("/profile?notice=profile-incomplete");
    return redirectTo("/profile?notice=welcome");
  }

  if (tokenHash && ["signup", "email", "recovery"].includes(type)) {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (error) return redirectTo("/login?notice=confirmation-failed");
    if (type === "recovery") {
      if (!(await establishRecoveryProof(supabase, data?.session?.access_token))) {
        return redirectTo("/login?notice=recovery-failed");
      }
      return redirectTo("/reset-password");
    }
    const phoneSaved = await persistSignupPhone(supabase);
    if (!phoneSaved) return redirectTo("/profile?notice=profile-incomplete");
    return redirectTo("/profile?notice=welcome");
  }

  return redirectTo("/login?notice=confirmation-failed");
}
