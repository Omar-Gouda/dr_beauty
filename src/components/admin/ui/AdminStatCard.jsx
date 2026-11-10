import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import AdminCard from "@/components/admin/ui/AdminCard";

const currencyFormatter = new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat("en-EG", { maximumFractionDigits: 1 });

export function formatAdminMetric(value, format = "number") {
  if (value == null || !Number.isFinite(Number(value))) return "Unavailable";
  if (format === "currency") return currencyFormatter.format(Number(value));
  if (format === "percent") return `${numberFormatter.format(Number(value))}%`;
  return numberFormatter.format(Number(value));
}

export default function AdminStatCard({ label, value, previousValue, format = "number", definition, icon: Icon, comparison = true, unavailableNote }) {
  const previous = Number(previousValue);
  const current = Number(value);
  const change = value != null && previousValue != null && Number.isFinite(previous) && Number.isFinite(current)
    ? previous === 0 ? (current === 0 ? 0 : null) : ((current - previous) / Math.abs(previous)) * 100
    : null;
  const ChangeIcon = change == null ? Minus : change >= 0 ? ArrowUpRight : ArrowDownRight;
  const changeText = change == null ? "No comparison available" : previous === 0 && current > 0 ? "New in this period" : `${Math.abs(change).toFixed(1)}% vs previous period`;

  return (
    <AdminCard className="relative overflow-hidden p-5 sm:p-6">
      <div className="absolute right-0 top-0 h-24 w-24 -translate-y-1/3 translate-x-1/3 rounded-full bg-[var(--color-primary-light)]/60" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--color-text-secondary)]">{label}</p>
          <p className="mt-3 break-words font-editorial text-2xl font-bold leading-tight text-[var(--color-text)] sm:text-3xl">{formatAdminMetric(value, format)}</p>
        </div>
        {Icon && <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-primary)]"><Icon aria-hidden="true" className="h-5 w-5" /></span>}
      </div>
      <div className="relative mt-5 flex min-h-5 items-center gap-1.5 text-[10px]">
        {comparison && <ChangeIcon aria-hidden="true" className={`h-3.5 w-3.5 ${change > 0 ? "text-[var(--color-success)]" : change < 0 ? "text-[var(--color-rose)]" : "text-[var(--color-text-secondary)]"}`} />}
        <span className="font-semibold text-[var(--color-text-secondary)]">{unavailableNote ?? (comparison ? changeText : "Current snapshot")}</span>
      </div>
      {definition && <p className="relative mt-2 text-[10px] leading-relaxed text-[var(--color-text-secondary)]">{definition}</p>}
    </AdminCard>
  );
}
