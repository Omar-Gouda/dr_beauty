import { redirect } from "next/navigation";
import { safePolicyReturnPath } from "@/lib/legal/policy-versions.mjs";

export async function redirectForPolicyAcceptance(supabase, returnPath) {
  const { data, error } = await supabase.rpc("get_current_policy_consent_status");
  if (error || typeof data?.needs_acceptance !== "boolean" || data.needs_acceptance) {
    const safePath = safePolicyReturnPath(returnPath);
    redirect(`/accept-policies?next=${encodeURIComponent(safePath)}`);
  }
}
