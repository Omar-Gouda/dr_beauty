import { connection } from "next/server";
import { redirect } from "next/navigation";
import Container from "@/components/ui/Container";
import PolicyAcceptanceForm from "@/components/account/PolicyAcceptanceForm";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import { safePolicyReturnPath } from "@/lib/legal/policy-versions.mjs";

export const metadata = {
  title: "Review updated policies",
  robots: { index: false, follow: false },
};

export default async function AcceptPoliciesPage({ searchParams }) {
  await connection();
  const params = await searchParams;
  const next = safePolicyReturnPath(typeof params?.next === "string" ? params.next : "/profile");
  if (getMissingSupabaseEnv().length > 0) {
    return <main className="section flex-1"><Container className="max-w-2xl"><section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8"><h1 className="section-heading">Policy acceptance is unavailable</h1><p className="section-description">Please try again later or contact Dr. Beauty support.</p></section></Container></main>;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect(`/login?next=${encodeURIComponent(`/accept-policies?next=${encodeURIComponent(next)}`)}`);

  const { data: status, error } = await supabase.rpc("get_current_policy_consent_status");
  if (error || !status) {
    return <main className="section flex-1"><Container className="max-w-2xl"><section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 sm:p-8"><h1 className="section-heading">We could not load the current policies</h1><p role="alert" className="section-description">Refresh this page to retry, or contact Dr. Beauty support.</p></section></Container></main>;
  }
  if (status.needs_acceptance === false) redirect(next);

  return <main className="section flex-1">
    <Container className="max-w-2xl">
      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-9">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-rose)]">Dr. Beauty</p>
        <h1 className="mt-3 font-editorial text-3xl font-semibold text-[var(--color-text)] sm:text-4xl">Please review our current policies</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--color-text-secondary)]">To continue using account and checkout features, review and accept the current Terms &amp; Conditions and Privacy Policy. Your account remains the same; this does not create a new account.</p>
        <PolicyAcceptanceForm next={next} />
      </section>
    </Container>
  </main>;
}
