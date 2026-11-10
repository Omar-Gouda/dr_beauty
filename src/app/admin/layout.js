import { Suspense } from "react";
import { redirect } from "next/navigation";
import AdminSidebar from "@/components/admin/AdminSidebar";
import AdminHeader from "@/components/admin/AdminHeader";
import { getAdminNotifications, getAdminRequestAccess } from "@/lib/admin";
import { BrandLoading } from "@/components/ui/Skeleton";

function AdminFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6">
      <BrandLoading label="Verifying secure admin access…" />
    </main>
  );
}

async function AuthorizedAdminLayout({ children }) {
  const access = await getAdminRequestAccess();
  if (access.status === "unauthenticated") redirect("/login?next=%2Fadmin");
  if (access.status !== "authorized") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--color-background)] p-6 text-[var(--color-text)]">
        <div className="max-w-lg rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center shadow-sm">
          <h1 className="mb-3 font-editorial text-2xl font-bold">
            {access.status === "forbidden" ? "Admin access required" : "Admin service unavailable"}
          </h1>
          <p role={access.status === "forbidden" ? undefined : "alert"} className="text-sm text-[var(--color-text-secondary)]">
            {access.status === "forbidden"
              ? "This account is not authorized to manage the store."
              : `Admin authorization could not be verified. Check Supabase configuration and apply the admin authorization migration${access.missing?.length ? `; missing ${access.missing.join(", ")}` : ""}.`}
          </p>
        </div>
      </main>
    );
  }

  const notificationResult = await getAdminNotifications(access.supabase, access.user.id);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] text-[var(--color-text)] lg:flex-row">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminHeader userEmail={access.user.email} notifications={notificationResult.data} notificationError={notificationResult.error} />
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-9 lg:py-9">{children}</main>
      </div>
    </div>
  );
}

export default function AdminLayout({ children }) {
  return <Suspense fallback={<AdminFallback />}><AuthorizedAdminLayout>{children}</AuthorizedAdminLayout></Suspense>;
}
