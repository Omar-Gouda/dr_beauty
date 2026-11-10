import Link from "next/link";
import { AlertTriangle, Archive, Download, FileSpreadsheet } from "lucide-react";
import AdminCard from "@/components/admin/ui/AdminCard";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";

function formatDate(value) {
  if (!value) return "Not yet recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date) + " UTC";
}

function Metric({ label, value }) {
  return <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
    <p className="text-[10px] font-semibold text-[var(--color-text-secondary)]">{label}</p>
    <p className="mt-2 font-editorial text-2xl font-bold text-[var(--color-text)]">{value == null ? "Unavailable" : Number(value).toLocaleString("en-EG")}</p>
  </div>;
}

export default function AdminReceiptArchiveManager({ archive, error = false }) {
  if (error || !archive) return <AdminEmptyState title="Receipt archive unavailable" description="The archive summary could not be loaded. Check admin access and confirm that the new local archive migration has been applied." icon={Archive} />;

  const isOverdue = archive.overdue === true;
  const isDueSoon = archive.due_soon === true;
  const banner = isOverdue
    ? "Archive action overdue. Check blocked orders and complete the required archive export."
    : isDueSoon
      ? "An archive or export deadline is approaching. Download the archive before the reminder date."
      : "Archive schedule is on track.";
  const bannerClass = isOverdue
    ? "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-text)]"
    : isDueSoon
      ? "border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] text-[var(--color-text)]"
      : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)]";

  return <div className="space-y-5">
    <AdminCard className="p-5 sm:p-7">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-primary)]"><Archive aria-hidden="true" className="h-5 w-5" /></span>
        <div><h2 className="font-editorial text-xl font-bold text-[var(--color-text)] sm:text-2xl">Archive status</h2><p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">Server archival and administrator downloads are tracked independently. The export reminder interval is 45 days and is an operational setting, not a statement of statutory retention duration.</p></div>
      </div>
      <p role={isOverdue ? "alert" : "status"} className={`mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-xs leading-relaxed ${bannerClass}`}>
        {isOverdue && <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}{banner}
      </p>
      {Number(archive.deletion_blocked_count) > 0 && <p role="alert" className="mt-3 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-xs leading-relaxed text-[var(--color-text)]">{Number(archive.deletion_blocked_count).toLocaleString("en-EG")} order(s) reached the 45-day deletion threshold but have no verified archive snapshot. They remain in operational storage until archival succeeds.</p>}
      {Number(archive.unresolved_failure_count) > 0 && <p role="alert" className="mt-3 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-xs leading-relaxed text-[var(--color-text)]">There are {Number(archive.unresolved_failure_count).toLocaleString("en-EG")} unresolved archival failure(s). The daily retention job will retry them; the failure records contain only order references, attempt type, time, and SQLSTATE.</p>}
      <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric label="Transactions archived" value={archive.archive_count} />
        <Metric label="Transactions awaiting archival" value={archive.awaiting_count} />
        <Metric label="Failed attempts" value={archive.failed_attempt_count} />
        <Metric label="Deletion blocked" value={archive.deletion_blocked_count} />
      </div>
      <dl className="mt-5 grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-xs sm:grid-cols-2">
        <div><dt className="font-semibold text-[var(--color-text-secondary)]">Last successful server archive</dt><dd className="mt-1 font-semibold text-[var(--color-text)]">{formatDate(archive.last_archived_at)}</dd></div>
        <div><dt className="font-semibold text-[var(--color-text-secondary)]">Last successful admin export</dt><dd className="mt-1 font-semibold text-[var(--color-text)]">{formatDate(archive.last_export_at)}</dd></div>
        <div><dt className="font-semibold text-[var(--color-text-secondary)]">Next expected archive or export</dt><dd className="mt-1 font-semibold text-[var(--color-text)]">{formatDate(archive.next_expected_archive_at)}</dd></div>
        <div><dt className="font-semibold text-[var(--color-text-secondary)]">Next admin export reminder</dt><dd className="mt-1 font-semibold text-[var(--color-text)]">{formatDate(archive.next_export_at)}</dd></div>
      </dl>
    </AdminCard>

    <AdminCard className="p-5 sm:p-7">
      <h2 className="font-editorial text-xl font-bold text-[var(--color-text)] sm:text-2xl">Download Receipt Archive</h2>
      <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--color-text-secondary)]">These files are internal transaction-history exports, not a claim that the file is an official tax invoice. Incremental exports include snapshots archived since the last successful incremental download. The complete export includes every server-side archive record. Each successful or failed export is recorded with administrator ID, timestamp, range, count, and result; customer values are not written to application logs.</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <a href="/admin/orders/receipts/export?mode=incremental" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><Download aria-hidden="true" className="h-4 w-4" />Download Receipt Archive</a>
        <a href="/admin/orders/receipts/export?mode=complete" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm font-semibold text-[var(--color-primary)] hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><FileSpreadsheet aria-hidden="true" className="h-4 w-4" />Download Complete Archive</a>
        <Link href="/admin/orders" className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">Back to orders</Link>
      </div>
    </AdminCard>
  </div>;
}
