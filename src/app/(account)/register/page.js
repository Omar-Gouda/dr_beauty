import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import AuthForm from "@/components/account/AuthForm";
import AuthPageShell from "@/components/account/AuthPageShell";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";

async function RegistrationFormForAnonymousVisitor() {
  await connection();
  let authenticated = false;
  if (getMissingSupabaseEnv().length === 0) {
    try {
      const supabase = await createClient();
      const { data: { user }, error } = await supabase.auth.getUser();
      authenticated = !error && Boolean(user);
    } catch { /* Keep registration available if the session check is unavailable. */ }
  }
  if (authenticated) redirect("/profile");
  return <AuthForm mode="register" />;
}

export default function RegisterPage() {
  return (
    <AuthPageShell
      eyebrow="A more personal routine"
      title="Create your account"
      description="Set up your account with a few essential details."
    >
      <Suspense fallback={<p role="status" className="auth-message">Preparing account creation...</p>}>
        <RegistrationFormForAnonymousVisitor />
      </Suspense>
    </AuthPageShell>
  );
}
