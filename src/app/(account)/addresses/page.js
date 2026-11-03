import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import AddressBookManager from "@/components/account/AddressBookManager";
import Container from "@/components/ui/Container";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";

async function AddressBookContent() {
  await connection();
  const missing = getMissingSupabaseEnv();
  if (missing.length) {
    return <main className="section flex-1"><Container className="max-w-4xl"><p role="alert" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-secondary)]">Your address book is unavailable. Check Supabase configuration and try again.<br /><Link href="/" className="mt-4 inline-block font-semibold text-[var(--color-primary)] hover:underline">Return to Dr. Beauty</Link></p></Container></main>;
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login?next=%2Faddresses");

  const { data: addresses, error } = await supabase
    .from("customer_addresses")
    .select("id,recipient_name,phone,governorate,city,address_line,delivery_notes,is_default")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });

  return (
    <main className="section flex-1">
      <Container className="max-w-4xl">
        <header className="mb-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-rose)]">Your space</p>
          <h1 className="section-heading mt-2">Address book</h1>
          <p className="section-description">Manage your saved delivery addresses and contact numbers.</p>
        </header>
        {error ? (
          <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">Your saved addresses could not be loaded. Please refresh and try again.</p>
        ) : (
          <AddressBookManager addresses={addresses ?? []} />
        )}
      </Container>
    </main>
  );
}

function AddressBookFallback() {
  return <main className="section"><Container className="max-w-4xl"><p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-secondary)]">Loading your address book…</p></Container></main>;
}

export default function AddressBookPage() {
  return <Suspense fallback={<AddressBookFallback />}><AddressBookContent /></Suspense>;
}
