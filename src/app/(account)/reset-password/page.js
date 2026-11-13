import { Suspense } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import AuthForm from "@/components/account/AuthForm";
import AuthPageShell from "@/components/account/AuthPageShell";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import {
  getRecoveryProofSecret,
  RECOVERY_PROOF_COOKIE,
  verifyRecoveryProof,
} from "@/lib/auth/recovery-proof.server.mjs";

async function ResetPasswordFromSession() {
  if (getMissingSupabaseEnv().length) redirect("/login?notice=confirmation-failed");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?notice=confirmation-failed");
  const cookieStore = await cookies();
  const recoveryProof = cookieStore.get(RECOVERY_PROOF_COOKIE)?.value;
  if (!verifyRecoveryProof(recoveryProof, user.id, getRecoveryProofSecret())) {
    redirect("/login?notice=recovery-failed");
  }

  return <AuthForm mode="reset" />;
}

export default function ResetPasswordPage() {
  return (
    <AuthPageShell
      eyebrow="Secure your account"
      title="Choose a new password"
      description="Use at least 8 characters for your new password."
    >
      <Suspense fallback={<p role="status" className="auth-message">Checking your recovery session...</p>}>
        <ResetPasswordFromSession />
      </Suspense>
    </AuthPageShell>
  );
}
