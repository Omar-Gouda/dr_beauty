import Link from "next/link";
import { AlertTriangle, Archive, ArrowUpRight, CalendarClock, Download, FileSpreadsheet } from "lucide-react";
import AdminCard from "@/components/admin/ui/AdminCard";

function dateTime(value) {
  if (!value) return "Not yet recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";
  return new Intl.DateTimeFormat("en-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(date);
}

function metric(label, value) {
  return <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
    <p className="text-[10px] font-semibold text-[var(--color-text-secondary)]">{label}</p>
    <p className="mt-2 font-editorial text-2xl font-bold text-[var(--color-text)]">{value == null ? "Unavailable" : Number(value).toLocaleString("en-EG")}</p>
  </div>;
}

export default function AdminReceiptArchiveSummary({ archive, error = false }) {
  const status = error || !archive ? "unavailable" : archive.overdue ? "overdue" : archive.due_soon ? "due_soon" : "current";
  const statusCopy = {
    unavailable: "Archive status unavailable",
    overdue: "Archive action overdue",
    due_soon: "Archive action due soon",
    current: "Archive schedule on track",
  }[status];
  const statusClass = status === "overdue" ? "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 text-[var(--color-text)]" : status === "due_soon" ? "border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] text-[var(--color-text)]" : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)]";

  return <AdminCard className="p-5 sm:p-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-primary)]"><Archive aria-hidden="true" className="h-5 w-5" /></span>
        <div><h3 className="font-editorial text-xl font-bold text-[var(--color-text)]">Receipt archive</h3><p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--color-text-secondary)]">A server-side transaction snapshot is saved before a 45-day eligible order is removed. Admin Excel downloads are tracked separately from this archive.</p></div>
      </div>
      <Link href="/admin/orders/receipts" className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-xs font-semibold text-[var(--color-primary)] hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">Open archive <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></Link>
    </div>

    {error || !archive ? <p role="status" className="mt-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-xs leading-relaxed text-[var(--color-text-secondary)]">Receipt archive metrics are unavailable. The local receipt archive migration must be applied before these features become available.</p> : <>
      <p className={`mt-5 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold ${statusClass}`} role={status === "overdue" ? "alert" : "status"}>
        {status === "overdue" ? <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" /> : status === "due_soon" ? <CalendarClock aria-hidden="true" className="h-4 w-4 shrink-0" /> : <FileSpreadsheet aria-hidden="true" className="h-4 w-4 shrink-0" />}
        {statusCopy}. Next expected archive or export: {dateTime(archive.next_expected_archive_at)} UTC.
      </p>
      {Number(archive.deletion_blocked_count) > 0 && <p role="alert" className="mt-3 rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 px-4 py-3 text-xs leading-relaxed text-[var(--color-text)]">{Number(archive.deletion_blocked_count).toLocaleString("en-EG")} due order(s) are not yet archived. Operational deletion is blocked until each snapshot is verified.</p>}
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metric("Transactions archived", archive.archive_count)}
        {metric("Awaiting archival", archive.awaiting_count)}
        {metric("Unresolved failures", archive.unresolved_failure_count)}
        {metric("Failed attempts", archive.failed_attempt_count)}
      </div>
      <div className="mt-4 flex flex-col gap-1 text-[10px] leading-relaxed text-[var(--color-text-secondary)] sm:flex-row sm:gap-5">
        <span>Last successful server archive: {dateTime(archive.last_archived_at)} UTC.</span>
        <span>Next admin download reminder: {dateTime(archive.next_export_at)} UTC.</span>
      </div>
      <Link href="/admin/orders/receipts" className="mt-4 inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-[var(--color-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><Download aria-hidden="true" className="h-4 w-4" />Download Receipt Archive</Link>
    </>}
  </AdminCard>;
}
