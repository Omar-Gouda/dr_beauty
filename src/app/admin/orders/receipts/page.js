import AdminPageHeader from "@/components/admin/ui/AdminPageHeader";
import AdminReceiptArchiveManager from "@/components/admin/AdminReceiptArchiveManager";
import { getAdminRequestAccess } from "@/lib/admin";

export default async function AdminOrderReceiptsPage() {
  const access = await getAdminRequestAccess();
  if (access.status !== "authorized") {
    return <p role="alert" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-secondary)]">Receipt archive access is unavailable. Verify admin authorization and apply the reviewed local archive migration.</p>;
  }

  const { data, error } = await access.supabase.rpc("admin_receipt_archive_overview");
  const archive = error ? null : data;
  return <div className="mx-auto max-w-[1200px] space-y-6">
    <AdminPageHeader
      eyebrow="DR. BEAUTY · SALES RECORDS"
      title="Receipt archive"
      description="Durable historical transaction snapshots are created on the server before eligible operational orders are removed. Excel downloads are separate, audited exports."
    />
    <AdminReceiptArchiveManager archive={archive} error={Boolean(error)} />
  </div>;
}
