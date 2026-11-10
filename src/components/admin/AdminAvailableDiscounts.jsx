"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import CustomSelect from "@/components/ui/Select";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import AdminStatusBadge from "@/components/admin/ui/AdminStatusBadge";
import { filterAdminPromotions, getPromotionCapacity, getPromotionLifecycleStatus } from "@/lib/admin-promotions.mjs";

const money = (value) => new Intl.NumberFormat("en-EG", { style: "currency", currency: "EGP", minimumFractionDigits: 2 }).format(Number(value) || 0);
const lifecycleLabels = { active: "Active", scheduled: "Scheduled", expired: "Expired", disabled: "Disabled" };

function statusTone(status) {
  if (status === "active") return "success";
  if (status === "scheduled") return "rose";
  return "muted";
}

function targetLabel(scope) {
  if (scope === "products") return "Selected products";
  if (scope === "categories") return "Selected categories";
  if (scope === "product_and_category") return "Selected products or categories";
  return "Entire order";
}

function promotionValue(promotion) {
  return promotion.discount_type === "percentage"
    ? `${Number(promotion.discount_value)}% off`
    : `${money(promotion.discount_value)} off`;
}

export default function AdminAvailableDiscounts({ promotions = [], asOf }) {
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const parsedAsOf = Date.parse(asOf);
  const now = Number.isFinite(parsedAsOf) ? parsedAsOf : 0;
  const visible = useMemo(() => filterAdminPromotions(promotions, { status, search }, now), [promotions, status, search, now]);
  if (!promotions.length) return <AdminEmptyState title="No promotions yet" description="Create a discount code to see its status and redemption capacity here." />;

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
      <label className="relative block"><span className="sr-only">Search discounts</span><Search aria-hidden="true" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code, title, type, or scope" className="min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] pl-11 pr-4 text-sm outline-none focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20" /></label>
      <CustomSelect id="dashboard-promotion-status" ariaLabel="Filter discounts by status" options={[{ value: "all", label: "All statuses" }, ...Object.entries(lifecycleLabels).map(([value, label]) => ({ value, label }))]} value={status} onChange={setStatus} />
    </div>
    <p role="status" aria-live="polite" className="text-xs text-[var(--color-text-secondary)]">Showing {visible.length} of {promotions.length} promotions.</p>
    {visible.length === 0 ? <AdminEmptyState title="No matching promotions" description="Try another status or search term." /> : <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
      {visible.map((promotion) => {
        const lifecycle = getPromotionLifecycleStatus(promotion, now);
        const capacity = getPromotionCapacity(promotion);
        const redeemed = Number(promotion.redemption_counts?.redeemed_count ?? 0);
        const expiry = promotion.ends_at ? new Intl.DateTimeFormat("en-EG", { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(promotion.ends_at)) : "No expiry";
        return <article key={promotion.id} className="min-w-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-semibold text-[var(--color-text)]">{promotion.title || promotion.code}</h3><p className="mt-1 font-mono text-xs font-semibold tracking-wide text-[var(--color-text-secondary)]">{promotion.code}</p></div><AdminStatusBadge tone={statusTone(lifecycle)}>{lifecycleLabels[lifecycle]}</AdminStatusBadge></div>
          <p className="mt-4 text-lg font-semibold text-[var(--color-primary)]">{promotionValue(promotion)}</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-[var(--color-border)] pt-3 text-xs">
            <div><dt className="text-[var(--color-text-secondary)]">Application</dt><dd className="mt-0.5">{targetLabel(promotion.application_scope)}</dd></div>
            <div><dt className="text-[var(--color-text-secondary)]">Redemptions</dt><dd className="mt-0.5">{redeemed.toLocaleString("en-EG")} actual uses</dd></div>
            <div><dt className="text-[var(--color-text-secondary)]">Capacity remaining</dt><dd className="mt-0.5">{capacity.remaining === null ? "Unlimited" : capacity.remaining.toLocaleString("en-EG")}</dd></div>
            <div><dt className="text-[var(--color-text-secondary)]">Per account</dt><dd className="mt-0.5">{promotion.per_account_redemption_limit ?? "Unlimited"}</dd></div>
            <div><dt className="text-[var(--color-text-secondary)]">Expires</dt><dd className="mt-0.5">{expiry}</dd></div>
            <div><dt className="text-[var(--color-text-secondary)]">Minimum</dt><dd className="mt-0.5">{money(promotion.minimum_subtotal)}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-1.5">{promotion.first_purchase_only && <span className="rounded-full bg-[var(--color-primary-light)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-primary)]">First purchase</span>}{promotion.tiered_discount_enabled && <span className="rounded-full bg-[var(--color-primary-light)] px-2.5 py-1 text-[10px] font-semibold text-[var(--color-primary)]">Tiered · one tier applies</span>}</div>
          {capacity.limit !== null && <div className="mt-3"><div className="mb-1 flex justify-between text-[10px] text-[var(--color-text-secondary)]"><span>{capacity.used} of {capacity.limit} capacity counted</span><span>{capacity.utilizationPercent}%</span></div><div role="meter" aria-label={`${promotion.code} redemption capacity used`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={capacity.utilizationPercent} className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]"><div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${capacity.utilizationPercent}%` }} /></div></div>}
          <div className="mt-4 border-t border-[var(--color-border)] pt-3"><Link href={`/admin/promotions?edit=${encodeURIComponent(promotion.id)}`} className="inline-flex min-h-10 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-xs font-semibold text-[var(--color-primary)] hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">Edit promotion</Link></div>
        </article>;
      })}
    </div>}
  </div>;
}
