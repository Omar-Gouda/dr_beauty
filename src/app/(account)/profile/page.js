import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import Container from "@/components/ui/Container";
import { createClient } from "@/lib/supabase/server";
import { getMissingSupabaseEnv } from "@/lib/supabase/config";
import ProfileEditor from "@/components/account/ProfileEditor";
import { logout } from "@/app/(account)/actions";
import { redirectForPolicyAcceptance } from "@/lib/legal/consent-gate";

const notices = {
  welcome: "Your account is ready.",
  "password-updated": "Your password has been updated.",
  "profile-incomplete": "Your account is confirmed, but we could not save your phone number. Add it below to finish your profile.",
};

function AccountUnavailable({ message }) {
  return (
    <main className="section flex-1">
      <Container className="max-w-3xl">
        <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-8">
          <h1 className="section-heading">My Account</h1>
          <p role="alert" className="section-description">{message}</p>
          <Link href="/" className="mt-5 inline-flex text-sm font-semibold text-[var(--color-primary)] hover:underline">Return to Dr. Beauty</Link>
        </section>
      </Container>
    </main>
  );
}

async function ProfileContent({ searchParams }) {
  await connection();
  const missing = getMissingSupabaseEnv();
  if (missing.length) return <AccountUnavailable message={`Account access needs Supabase configuration. Missing: ${missing.join(", ")}.`} />;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) redirect("/login?next=%2Fprofile");
  await redirectForPolicyAcceptance(supabase, "/profile");

  const [{ data: profile, error: profileError }, { data: addresses, error: addressesError }, { data: recentOrders, error: ordersError }, { data: isAdmin }] = await Promise.all([
    supabase
    .from("profiles")
    .select("full_name,phone,show_public_ranking")
    .eq("id", user.id)
    .maybeSingle(),
    supabase
      .from("customer_addresses")
      .select("id,recipient_name,phone,governorate,city,address_line,is_default")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2),
    supabase
      .from("orders")
      .select("order_number,created_at,order_status,currency,total_amount")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase.rpc("is_current_user_admin"),
  ]);
  const params = await searchParams;
  const fullName = profile?.full_name?.trim() || "Beauty customer";

  return (
    <main className="section flex-1">
      <Container className="max-w-4xl">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-rose)]">Your space</p>
            <h1 className="section-heading mt-2">My Account</h1>
            <p className="section-description">Welcome, {fullName}. Manage your personal details, delivery addresses and orders.</p>
          </div>
        </header>

        <section className="mb-6 flex flex-wrap items-center gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-6">
          <div aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] font-editorial text-2xl font-semibold text-[var(--color-primary)]">
            {fullName.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-editorial text-xl font-semibold text-[var(--color-text)]">Profile overview</h2>
            <p className="mt-1 break-all text-sm text-[var(--color-text-secondary)]">{user.email ?? "Email unavailable"}</p>
          </div>
          <p className="text-sm text-[var(--color-text-secondary)]">Your profile, saved details, and recent activity in one place.</p>
          {isAdmin === true && (
            <Link href="/admin" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--color-primary)] bg-[var(--color-primary)] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] focus-visible:ring-offset-2">
              Open Admin Dashboard
            </Link>
          )}
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-8">
            <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="font-editorial text-2xl font-semibold text-[var(--color-text)]">Personal information</h2>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Your account details are kept private.</p>
              </div>
            </div>
            {profileError || !profile ? (
              <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">We could not load your profile. Please try again later.</p>
            ) : (
              <ProfileEditor
                defaults={{ fullName: profile.full_name ?? "", phone: profile.phone ?? "", showPublicRanking: profile.show_public_ranking === true }}
                email={user.email ?? "Email unavailable"}
                notice={notices[params?.notice] ?? ""}
              />
            )}
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-8">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="font-editorial text-2xl font-semibold text-[var(--color-text)]">Address book</h2><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Your saved delivery details.</p></div>
              <Link href="/addresses" className="text-sm font-semibold text-[var(--color-primary)] hover:underline">Manage addresses</Link>
            </div>
            {addressesError ? <p role="status" className="text-sm text-[var(--color-text-secondary)]">Saved addresses are temporarily unavailable.</p> : !addresses?.length ? (
              <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-5 text-sm text-[var(--color-text-secondary)]">No saved addresses yet.</p>
            ) : (
              <div className="grid gap-4">
                {addresses.map((address) => <article key={address.id} className="rounded-2xl border border-[var(--color-border)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{address.recipient_name}</h3>{address.is_default && <span className="rounded-full bg-[var(--color-primary-light)] px-3 py-1 text-[10px] font-semibold text-[var(--color-rose)]">Default</span>}</div>
                  <p className="mt-2 text-sm text-[var(--color-text-secondary)]">{address.phone}</p>
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{address.address_line}, {address.city}, {address.governorate}</p>
                </article>)}
              </div>
            )}
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-8">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="font-editorial text-2xl font-semibold text-[var(--color-text)]">Recent orders</h2><p className="mt-1 text-sm text-[var(--color-text-secondary)]">Your latest purchases and delivery progress.</p></div>
              <Link href="/orders" className="text-sm font-semibold text-[var(--color-primary)] hover:underline">View order history</Link>
            </div>
            {ordersError ? <p role="status" className="text-sm text-[var(--color-text-secondary)]">Recent orders are temporarily unavailable.</p> : !recentOrders?.length ? (
              <p className="rounded-2xl border border-dashed border-[var(--color-border)] p-5 text-sm text-[var(--color-text-secondary)]">No orders to show yet. <Link href="/shop" className="font-semibold text-[var(--color-primary)] hover:underline">Explore the store</Link></p>
            ) : <ul className="divide-y divide-[var(--color-border)]">{recentOrders.map((order) => <li key={order.order_number} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0">
              <div><p className="font-semibold">Order #{order.order_number}</p><p className="mt-1 text-xs capitalize text-[var(--color-text-secondary)]">{order.order_status.replaceAll("_", " ")}</p></div>
              <p className="text-sm font-semibold">{new Intl.NumberFormat("en-EG", { style: "currency", currency: order.currency }).format(Number(order.total_amount))}</p>
            </li>)}</ul>}
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-editorial text-2xl font-semibold text-[var(--color-text)]">Wishlist</h2>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Your saved favorites are available on this device.</p>
              </div>
              <Link href="/wishlist" className="text-sm font-semibold text-[var(--color-primary)] hover:underline">View wishlist</Link>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-editorial text-2xl font-semibold text-[var(--color-text)]">Shopping</h2>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Discover products for your routine.</p>
              </div>
              <Link href="/shop" className="text-sm font-semibold text-[var(--color-primary)] hover:underline">Explore the shop</Link>
            </div>
          </section>

          <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-8">
            <h2 className="font-editorial text-xl font-semibold text-[var(--color-text)]">Account security</h2>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Update your password whenever you need to.</p>
            <Link href="/forgot-password" className="mt-4 inline-block text-sm font-semibold text-[var(--color-primary)] hover:underline">Change password</Link>
            <div className="mt-6 border-t border-[var(--color-border)] pt-5">
              <p className="text-sm text-[var(--color-text-secondary)]">Finished managing your account?</p>
              <form action={logout} className="mt-3">
                <button type="submit" className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-border)] px-5 py-2 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-rose)] hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">Sign out</button>
              </form>
            </div>
          </section>
        </div>
      </Container>
    </main>
  );
}

function ProfileFallback() {
  return <main className="section"><Container className="max-w-6xl"><p role="status" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-secondary)]">Loading your account…</p></Container></main>;
}

export default function ProfilePage({ searchParams }) {
  return <Suspense fallback={<ProfileFallback />}><ProfileContent searchParams={searchParams} /></Suspense>;
}
