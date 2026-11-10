"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit, Plus, Search, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import AccessibleDialog from "@/components/ui/AccessibleDialog";
import CustomSelect from "@/components/ui/Select";
import PromotionTargetPicker from "@/components/admin/PromotionTargetPicker";
import { useToast } from "@/constants/ToastContext";
import { savePromotion, saveShippingSettings, setPromotionActive } from "@/app/admin/actions";
import { buildDiscountCommunityMessage } from "@/lib/whatsapp/messages.mjs";
import { countPromotionStatuses, filterAdminPromotions, getPromotionCapacity, getPromotionLifecycleStatus, getPromotionTargetSummary } from "@/lib/admin-promotions.mjs";

const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";
function formatRedemptionCount(value) {
  const count = String(value ?? 0);
  return /^\d+$/.test(count) ? count : "0";
}

function RedemptionCounts({ promotion }) {
  const counts = promotion.redemption_counts ?? {};
  return (
    <div className="mt-2 space-y-0.5 text-[10px] text-[var(--color-text-secondary)]" aria-label={`Redemption history for ${promotion.code}`}>
      <p>Records: {formatRedemptionCount(counts.total_records)} · capacity counted: {formatRedemptionCount(counts.capacity_count)}</p>
      <p>Reserved {formatRedemptionCount(counts.reserved_count)} · Redeemed {formatRedemptionCount(counts.redeemed_count)}</p>
      <p>Cancelled {formatRedemptionCount(counts.cancelled_count)} · Refunded {formatRedemptionCount(counts.refunded_count)} · Released {formatRedemptionCount(counts.released_count)}</p>
    </div>
  );
}

function getPromotionStatusBadgeClass(promotion, now) {
  const status = getPromotionLifecycleStatus(promotion, now);
  if (status === "active") return "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]";
  if (status === "scheduled") return "border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] text-[var(--color-primary)]";
  return "border-[var(--color-border)] text-[var(--color-text-secondary)]";
}

function RedemptionCapacity({ promotion }) {
  const capacity = getPromotionCapacity(promotion);
  return (
    <div className="mt-1 space-y-1 text-[10px] text-[var(--color-text-secondary)]">
      <p>Capacity {capacity.used} / {capacity.limit === null ? "unlimited" : capacity.limit}{capacity.remaining === null ? "" : ` · ${capacity.remaining} remaining · ${capacity.utilizationPercent}% used`}</p>
      {capacity.limit !== null && <div role="meter" aria-label={`${promotion.code} redemption capacity used`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={capacity.utilizationPercent} className="h-1.5 overflow-hidden rounded-full bg-[var(--color-border)]"><div className="h-full rounded-full bg-[var(--color-primary)]" style={{ width: `${capacity.utilizationPercent}%` }} /></div>}
    </div>
  );
}

function utcInputValue(value) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function utcIsoValue(value) {
  return value ? `${value}:00.000Z` : "";
}

export default function AdminPromotionsManager({ promotions, productOptions = [], categoryOptions = [], shippingSettings, asOf, editPromotionId, channelUrl }) {
  const [editing, setEditing] = useState(null);
  const [discountType, setDiscountType] = useState("percentage");
  const [applicationScope, setApplicationScope] = useState("order");
  const [productTargetIds, setProductTargetIds] = useState([]);
  const [categoryTargetIds, setCategoryTargetIds] = useState([]);
  const [tieredDiscountEnabled, setTieredDiscountEnabled] = useState(false);
  const [discountTiers, setDiscountTiers] = useState([]);
  const [promotionStatusFilter, setPromotionStatusFilter] = useState("all");
  const [promotionSearch, setPromotionSearch] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [sharePromotion, setSharePromotion] = useState(null);
  const [shareFeedback, setShareFeedback] = useState("");
  const shareMessageRef = useRef(null);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();
  const now = Date.parse(asOf) || 0;
  const statusCounts = countPromotionStatuses(promotions, now);
  const targetSummaryByPromotion = Object.fromEntries(promotions.map((promotion) => [
    promotion.id,
    getPromotionTargetSummary(promotion, productOptions, categoryOptions),
  ]));
  const visiblePromotions = filterAdminPromotions(promotions, { status: promotionStatusFilter, search: promotionSearch }, now, targetSummaryByPromotion);
  let shareMessage = "";
  if (sharePromotion) {
    try { shareMessage = buildDiscountCommunityMessage(sharePromotion); } catch { shareMessage = ""; }
  }

  function submit(event) {
    event.preventDefault();
    if (isPending) return;
    const form = new FormData(event.currentTarget);
    setSharePromotion(null);
    setShareFeedback("");
    const input = {
      id: editing?.id,
      code: String(form.get("code") ?? ""),
      title: String(form.get("title") ?? ""),
      description: String(form.get("description") ?? ""),
      discountType,
      discountValue: String(form.get("discountValue") ?? ""),
      maximumDiscount: String(form.get("maximumDiscount") ?? ""),
      minimumSubtotal: String(form.get("minimumSubtotal") ?? "0"),
      startsAt: utcIsoValue(String(form.get("startsAt") ?? "")),
      endsAt: utcIsoValue(String(form.get("endsAt") ?? "")),
      maximumRedemptions: String(form.get("maximumRedemptions") ?? ""),
      perAccountRedemptionLimit: String(form.get("perAccountRedemptionLimit") ?? "1"),
      firstPurchaseOnly: form.get("firstPurchaseOnly") === "on",
      tieredDiscountEnabled,
      discountTiers,
      applicationScope,
      productTargetIds: ["products", "product_and_category"].includes(applicationScope) ? productTargetIds : [],
      categoryTargetIds: ["categories", "product_and_category"].includes(applicationScope) ? categoryTargetIds : [],
      isFeatured: form.get("isFeatured") === "on",
      displayPriority: String(form.get("displayPriority") ?? "0"),
      isAnnouncement: form.get("isAnnouncement") === "on",
      announcementPriority: String(form.get("announcementPriority") ?? "0"),
      targetPath: String(form.get("targetPath") ?? "/shop"),
      isActive: form.get("isActive") === "on",
    };
    startTransition(async () => {
      let result;
      try {
        result = await savePromotion(input);
      } catch {
        showToast("The discount save could not be confirmed. Refresh and check before retrying.", "error");
        return;
      }
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) {
        setIsOpen(false);
        if (result.savedPromotion) setSharePromotion(result.savedPromotion);
        router.refresh();
      }
    });
  }

  function toggle(promotion) {
    if (isPending) return;
    startTransition(async () => {
      const result = await setPromotionActive(promotion.id, !promotion.is_active);
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) router.refresh();
    });
  }

  function openNewPromotion() {
    setEditing(null);
    setDiscountType("percentage");
    setApplicationScope("order");
    setProductTargetIds([]);
    setCategoryTargetIds([]);
    setTieredDiscountEnabled(false);
    setDiscountTiers([]);
    setIsOpen(true);
  }

  function openEditPromotion(promotion) {
    setEditing(promotion);
    setDiscountType(promotion.discount_type);
    setApplicationScope(promotion.application_scope ?? "order");
    setProductTargetIds(promotion.product_target_ids ?? []);
    setCategoryTargetIds(promotion.category_target_ids ?? []);
    setTieredDiscountEnabled(promotion.tiered_discount_enabled === true);
    setDiscountTiers((promotion.discount_tiers ?? []).map((tier) => ({
      minimumSubtotal: String(tier.minimum_subtotal ?? ""),
      discountType: tier.discount_type ?? "percentage",
      discountValue: String(tier.discount_value ?? ""),
      maximumDiscount: tier.maximum_discount == null ? "" : String(tier.maximum_discount),
    })));
    setIsOpen(true);
  }

  useEffect(() => {
    if (!editPromotionId) return;
    const promotion = promotions.find((item) => item.id === editPromotionId);
    if (promotion) {
      startTransition(() => openEditPromotion(promotion));
      router.replace("/admin/promotions", { scroll: false });
    }
  }, [editPromotionId, promotions, router]);

  function submitShipping(event) {
    event.preventDefault();
    if (isPending) return;
    const form = new FormData(event.currentTarget);
    const input = {
      isShippingEnabled: form.get("isShippingEnabled") === "on",
      defaultFee: String(form.get("defaultFee") ?? ""),
      freeShippingMinimumSubtotal: String(form.get("freeShippingMinimumSubtotal") ?? ""),
      giftPackagingFee: String(form.get("giftPackagingFee") ?? ""),
    };
    startTransition(async () => {
      const result = await saveShippingSettings(input);
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      {sharePromotion && <section className="space-y-4 rounded-3xl border border-[var(--color-primary)]/30 bg-[var(--color-primary-light)] p-5 sm:p-7" aria-labelledby="discount-share-heading">
        <div>
          <h2 id="discount-share-heading" className="font-editorial text-xl font-bold">Discount saved — ready to share</h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-secondary)]">Copy the message, open the Dr. Beauty WhatsApp Channel, then paste and publish it yourself. Nothing is posted automatically. Check the promotion schedule and activation before sharing.</p>
        </div>
        {shareMessage ? <textarea ref={shareMessageRef} aria-label="Prepared discount message" readOnly rows={Math.min(10, shareMessage.split("\n").length + 1)} value={shareMessage} className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm leading-6 text-[var(--color-text)]" /> : <p role="alert" className="text-sm text-red-700">The saved discount details could not be prepared for sharing.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" disabled={!shareMessage} onClick={async () => {
            try {
              await navigator.clipboard.writeText(shareMessage);
              setShareFeedback("Discount message copied. Paste it into your community chat and send it manually.");
            } catch {
              shareMessageRef.current?.select();
              setShareFeedback("We could not copy the message automatically. It is selected above; copy it, then paste it into your community chat.");
            }
          }}>Copy discount message</Button>
          {channelUrl ? <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm font-semibold text-[var(--color-primary)] hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">Open WhatsApp Channel</a> : <span className="self-center text-xs text-[var(--color-text-secondary)]">WhatsApp Channel link is not configured.</span>}
          <Button type="button" variant="outline" onClick={() => { setSharePromotion(null); setShareFeedback(""); }}>Close</Button>
        </div>
        {shareFeedback && <p role="status" className="text-sm text-[var(--color-text-secondary)]">{shareFeedback}</p>}
      </section>}
      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-sm sm:p-7">
        <h2 className="font-editorial text-xl font-bold">Shipping configuration</h2>
        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">Set the standard delivery fee and free-delivery minimum for new orders.</p>
        <form onSubmit={submitShipping} className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold">Default shipping fee (EGP)<input name="defaultFee" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" min="0" step="0.01" defaultValue={shippingSettings.default_fee} className={inputClass} /></label>
          <label className="block text-xs font-semibold">Free shipping minimum subtotal (EGP, optional)<input name="freeShippingMinimumSubtotal" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" min="0" step="0.01" defaultValue={shippingSettings.free_shipping_minimum_subtotal ?? ""} className={inputClass} /></label>
          <label className="block text-xs font-semibold">Gift packaging fee (EGP, optional)<input name="giftPackagingFee" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" min="0.01" step="0.01" defaultValue={shippingSettings.gift_packaging_fee ?? ""} className={inputClass} /><span className="mt-1 block font-normal text-[var(--color-text-secondary)]">Leave blank until the owner confirms a positive price. Gift packaging stays unavailable while unset.</span></label>
          <label className="flex items-center gap-2 text-xs sm:col-span-2"><input name="isShippingEnabled" type="checkbox" defaultChecked={shippingSettings.is_shipping_enabled} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /> Delivery is available</label>
          <div className="sm:col-span-2"><Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save shipping settings"}</Button></div>
        </form>
      </section>
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-editorial text-2xl font-bold sm:text-3xl">Discounts &amp; featured offers</h2>
          <p className="text-xs text-[var(--color-text-secondary)] sm:text-sm">Create discount codes and manage their value, schedule, eligibility, and storefront visibility.</p>
        </div>
        <Button type="button" onClick={openNewPromotion}><Plus className="h-4 w-4" /> Add Discount</Button>
      </div>

      <section aria-label="Promotion overview" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[["Active", "active"], ["Scheduled", "scheduled"], ["Expired", "expired"], ["Disabled", "disabled"]].map(([label, status]) => (
          <button key={status} type="button" aria-pressed={promotionStatusFilter === status} onClick={() => setPromotionStatusFilter(promotionStatusFilter === status ? "all" : status)} className={`rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] ${promotionStatusFilter === status ? "border-[var(--color-primary)] bg-[var(--color-primary-light)]" : "border-[var(--color-border)] bg-[var(--color-surface)]"}`}>
            <span className="block text-xs text-[var(--color-text-secondary)]">{label}</span><span className="mt-1 block font-editorial text-2xl font-bold">{statusCounts[status]}</span>
          </button>
        ))}
      </section>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px]">
        <label className="relative block text-xs font-semibold"><span className="sr-only">Search promotions</span><Search aria-hidden="true" size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" /><input type="search" value={promotionSearch} onChange={(event) => setPromotionSearch(event.target.value)} placeholder="Search code, title, type, or scope" className={`${inputClass} pl-11`} /></label>
        <CustomSelect id="promotion-status-filter" ariaLabel="Filter promotions by status" options={[{ value: "all", label: "All statuses" }, { value: "active", label: "Active" }, { value: "scheduled", label: "Scheduled" }, { value: "expired", label: "Expired" }, { value: "disabled", label: "Disabled" }]} value={promotionStatusFilter} onChange={setPromotionStatusFilter} />
      </div>
      <p role="status" aria-live="polite" className="text-xs text-[var(--color-text-secondary)]">Showing {visiblePromotions.length} of {promotions.length} promotions.</p>

      <div className="hidden overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm lg:block">
        <div tabIndex={0} role="region" aria-label="Promotions table; scroll horizontally to view all columns" className="overflow-x-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><table className="w-full border-collapse text-left text-xs">
          <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]/50 text-[11px] uppercase text-[var(--color-text-secondary)]"><th className="p-4">Code</th><th className="p-4">Discount</th><th className="p-4">Eligibility</th><th className="p-4">Schedule</th><th className="p-4">Storefront</th><th className="p-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {visiblePromotions.map((promotion) => <tr key={promotion.id}>
              <td className="p-4"><p className="font-bold tracking-wide">{promotion.code}{promotion.tiered_discount_enabled ? <span className="ml-2 rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[9px] text-[var(--color-primary)]">Tiered</span> : null}</p>{promotion.title && <p className="mt-1 text-xs">{promotion.title}{promotion.is_featured ? " · Featured" : ""}</p>}{promotion.description && <p className="mt-1 max-w-xs text-[10px] text-[var(--color-text-secondary)]">{promotion.description}</p>}</td>
              <td className="p-4">{promotion.discount_type === "percentage" ? `${promotion.discount_value}%` : `EGP ${Number(promotion.discount_value).toFixed(2)}`}{promotion.maximum_discount != null && <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">Maximum EGP {Number(promotion.maximum_discount).toFixed(2)}</p>}</td>
              <td className="p-4"><p>{promotion.application_scope === "order" ? "Minimum order subtotal" : "Minimum eligible subtotal"} EGP {Number(promotion.minimum_subtotal).toFixed(2)}</p><p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">Scope: {promotion.application_scope ?? "order"}; targets: {getPromotionTargetSummary(promotion, productOptions, categoryOptions)}{promotion.first_purchase_only ? " Â· First purchase only" : ""}</p><p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">{promotion.maximum_redemptions == null ? "Unlimited total uses" : `Up to ${promotion.maximum_redemptions} total uses`}</p><p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">{promotion.per_account_redemption_limit == null ? "Unlimited per account" : `Up to ${promotion.per_account_redemption_limit} per account`}</p><RedemptionCounts promotion={promotion} /><RedemptionCapacity promotion={promotion} /></td>
              <td className="p-4 text-[10px]">{promotion.starts_at ? new Date(promotion.starts_at).toLocaleString("en-EG", { timeZone: "UTC" }) : "No start"}<p className="mt-1">{promotion.ends_at ? `Until ${new Date(promotion.ends_at).toLocaleString("en-EG", { timeZone: "UTC" })} UTC` : "No expiry"}</p></td>
              <td className="p-4"><span className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${getPromotionStatusBadgeClass(promotion, now)}`}>{getPromotionLifecycleStatus(promotion, now)}</span><p className="mt-2 text-[10px] text-[var(--color-text-secondary)]">{promotion.is_announcement ? `Announcement · priority ${promotion.announcement_priority}` : "Not announced"}</p></td>
              <td className="p-4 text-right"><div className="flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => openEditPromotion(promotion)} aria-label={`Edit ${promotion.code}`}><Edit className="h-3.5 w-3.5" /><span className="sr-only">Edit</span></Button><Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => toggle(promotion)}>{promotion.is_active ? "Deactivate" : "Activate"}</Button></div></td>
            </tr>)}
            {visiblePromotions.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-[var(--color-text-secondary)]">{promotions.length === 0 ? "No discount codes yet. Create one to make it available at checkout." : "No promotions match this search and status filter."}</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="space-y-3 lg:hidden">
        {visiblePromotions.map((promotion) => (
          <article key={promotion.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-all font-bold tracking-wide">{promotion.code}{promotion.tiered_discount_enabled ? <span className="ml-2 inline-block rounded-full bg-[var(--color-primary-light)] px-2 py-0.5 text-[9px] text-[var(--color-primary)]">Tiered</span> : null}</h3>
                {promotion.title && <p className="mt-1 break-words text-sm font-medium">{promotion.title}{promotion.is_featured ? " · Featured" : ""}</p>}
                {promotion.description && <p className="mt-1 break-words text-xs text-[var(--color-text-secondary)]">{promotion.description}</p>}
              </div>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold ${getPromotionStatusBadgeClass(promotion, now)}`}>{getPromotionLifecycleStatus(promotion, now)}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-3 text-xs">
              <div><dt className="text-[var(--color-text-secondary)]">Discount</dt><dd className="mt-1 font-semibold">{promotion.discount_type === "percentage" ? `${promotion.discount_value}%` : `EGP ${Number(promotion.discount_value).toFixed(2)}`}{promotion.maximum_discount != null && <span className="block font-normal text-[var(--color-text-secondary)]">Maximum EGP {Number(promotion.maximum_discount).toFixed(2)}</span>}</dd></div>
              <div><dt className="text-[var(--color-text-secondary)]">Eligibility</dt><dd className="mt-1">{promotion.application_scope === "order" ? "Minimum order subtotal" : "Minimum eligible subtotal"} EGP {Number(promotion.minimum_subtotal).toFixed(2)}<span className="block text-[var(--color-text-secondary)]">Scope: {promotion.application_scope ?? "order"}; targets: {getPromotionTargetSummary(promotion, productOptions, categoryOptions)}{promotion.first_purchase_only ? " Â· First purchase only" : ""}</span><span className="block text-[var(--color-text-secondary)]">{promotion.maximum_redemptions == null ? "Unlimited total uses" : `Up to ${promotion.maximum_redemptions} total uses`}</span><span className="block text-[var(--color-text-secondary)]">{promotion.per_account_redemption_limit == null ? "Unlimited per account" : `Up to ${promotion.per_account_redemption_limit} per account`}</span></dd></div>
              <div><dt className="text-[var(--color-text-secondary)]">Schedule</dt><dd className="mt-1">{promotion.starts_at ? new Date(promotion.starts_at).toLocaleString("en-EG", { timeZone: "UTC" }) : "No start"}<span className="block">{promotion.ends_at ? `Until ${new Date(promotion.ends_at).toLocaleString("en-EG", { timeZone: "UTC" })} UTC` : "No expiry"}</span></dd></div>
              <div><dt className="text-[var(--color-text-secondary)]">Storefront</dt><dd className="mt-1">{promotion.is_announcement ? `Announcement · priority ${promotion.announcement_priority}` : "Not announced"}<span className="block">{promotion.is_featured ? `Featured · priority ${promotion.display_priority}` : "Not featured"}</span></dd></div>
              <div className="col-span-2"><dt className="text-[var(--color-text-secondary)]">Redemption history</dt><dd><RedemptionCounts promotion={promotion} /><RedemptionCapacity promotion={promotion} /></dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
              <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => openEditPromotion(promotion)} aria-label={`Edit ${promotion.code}`}><Edit aria-hidden="true" className="h-3.5 w-3.5" />Edit</Button>
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => toggle(promotion)}>{promotion.is_active ? "Deactivate" : "Activate"}</Button>
            </div>
          </article>
        ))}
        {visiblePromotions.length === 0 && <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center text-sm text-[var(--color-text-secondary)]">{promotions.length === 0 ? "No discount codes yet. Create one to make it available at checkout." : "No promotions match this search and status filter."}</p>}
      </div>

      {isOpen && <AccessibleDialog onClose={() => setIsOpen(false)} labelledBy="promotion-editor-title">
        <form onSubmit={submit} aria-labelledby="promotion-editor-title" className="mx-auto my-[max(12px,4dvh)] max-h-[92dvh] w-[calc(100%-24px)] max-w-2xl space-y-4 overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl sm:p-8">
        <h2 id="promotion-editor-title" className="font-editorial text-xl font-bold">{editing ? "Edit Discount" : "Create Discount"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold">Code<input name="code" required maxLength={64} defaultValue={editing?.code ?? ""} autoComplete="off" className={inputClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]"><span>Discount type</span><CustomSelect id="promotion-discount-type" ariaLabel="Discount type" options={[{ value: "percentage", label: "Percentage" }, { value: "fixed_amount", label: "Fixed amount (EGP)" }]} value={discountType} onChange={setDiscountType} disabled={isPending} /></label>
          <label className="block text-xs font-semibold">Discount value<input name="discountValue" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" min="0.01" step="0.01" defaultValue={editing?.discount_value ?? ""} className={inputClass} /></label>
          <label className="block text-xs font-semibold">Maximum discount (optional, EGP)<input name="maximumDiscount" inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" min="0.01" step="0.01" defaultValue={editing?.maximum_discount ?? ""} className={inputClass} /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]"><span>Application scope</span><CustomSelect id="promotion-application-scope" ariaLabel="Application scope" options={[{ value: "order", label: "Entire order" }, { value: "products", label: "Selected products" }, { value: "categories", label: "Selected categories" }, { value: "product_and_category", label: "Selected products or categories" }]} value={applicationScope} onChange={setApplicationScope} disabled={isPending} /></label>
          <label className="block text-xs font-semibold">{applicationScope === "order" ? "Minimum order subtotal (EGP)" : "Minimum eligible subtotal (EGP)"}<input name="minimumSubtotal" required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" min="0" step="0.01" defaultValue={editing?.minimum_subtotal ?? "0"} className={inputClass} /></label>
          <label className="block text-xs font-semibold">Maximum redemptions (optional)<input name="maximumRedemptions" type="number" min="1" step="1" defaultValue={editing?.maximum_redemptions ?? ""} className={inputClass} /></label>
          <label className="block text-xs font-semibold">Maximum uses per account<input name="perAccountRedemptionLimit" type="number" min="1" step="1" defaultValue={editing ? (editing.per_account_redemption_limit ?? "") : "1"} className={inputClass} /><span className="mt-1 block font-normal text-[var(--color-text-secondary)]">Default is 1. Leave blank for unlimited uses per account.</span></label>
          <label className="block text-xs font-semibold">Starts at (optional, UTC)<input name="startsAt" type="datetime-local" defaultValue={utcInputValue(editing?.starts_at)} className={inputClass} /></label>
          <label className="block text-xs font-semibold">Expires at (optional, UTC)<input name="endsAt" type="datetime-local" defaultValue={utcInputValue(editing?.ends_at)} className={inputClass} /></label>
        </div>
        <section className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4" aria-labelledby="promotion-tiers-heading">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={tieredDiscountEnabled} disabled={isPending} onChange={(event) => {
              const enabled = event.target.checked;
              setTieredDiscountEnabled(enabled);
              if (enabled && discountTiers.length === 0) {
                setDiscountTiers([{ minimumSubtotal: "0", discountType: "percentage", discountValue: "", maximumDiscount: "" }]);
              } else if (!enabled && discountTiers.some((tier) => !tier.minimumSubtotal || !tier.discountValue)) {
                setDiscountTiers([]);
              }
            }} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" />
            Use tiered discounts
          </label>
          <p id="promotion-tiers-heading" className="text-xs leading-5 text-[var(--color-text-secondary)]">The highest threshold reached applies one discount. Tiers never stack. Thresholds use the eligible subtotal for targeted promotions. Disabling tiers keeps complete tier settings for later reactivation.</p>
          {tieredDiscountEnabled && <div className="space-y-3">
            {discountTiers.map((tier, index) => <div key={`tier-${index}`} className="grid items-end gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold">Minimum subtotal (EGP)<input aria-label={`Tier ${index + 1} minimum subtotal`} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" min="0" step="0.01" value={tier.minimumSubtotal} disabled={isPending} onChange={(event) => setDiscountTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, minimumSubtotal: event.target.value } : item))} className={inputClass} /></label>
              <label className="grid gap-1.5 text-xs font-semibold"><span>Type</span><CustomSelect id={`promotion-tier-type-${index}`} ariaLabel={`Tier ${index + 1} discount type`} options={[{ value: "percentage", label: "Percentage" }, { value: "fixed_amount", label: "Fixed amount (EGP)" }]} value={tier.discountType} onChange={(value) => setDiscountTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, discountType: value } : item))} disabled={isPending} /></label>
              <label className="block text-xs font-semibold">Discount<input aria-label={`Tier ${index + 1} discount`} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" min="0.01" step="0.01" value={tier.discountValue} disabled={isPending} onChange={(event) => setDiscountTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, discountValue: event.target.value } : item))} className={inputClass} /></label>
              <label className="block text-xs font-semibold">Tier cap (optional)<input aria-label={`Tier ${index + 1} maximum discount`} inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" min="0.01" step="0.01" value={tier.maximumDiscount} disabled={isPending} onChange={(event) => setDiscountTiers((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, maximumDiscount: event.target.value } : item))} className={inputClass} /></label>
              <Button type="button" variant="outline" aria-label={`Remove tier ${index + 1}`} disabled={isPending} onClick={() => setDiscountTiers((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></Button>
            </div>)}
            <Button type="button" variant="secondary" disabled={isPending || discountTiers.length >= 25} onClick={() => setDiscountTiers((current) => [...current, { minimumSubtotal: "", discountType: "percentage", discountValue: "", maximumDiscount: "" }])}><Plus size={16} /> Add tier</Button>
            {discountTiers.length === 0 && <p role="alert" className="text-xs text-red-700">Add at least one tier before saving.</p>}
          </div>}
        </section>
        {applicationScope === "products" || applicationScope === "product_and_category" ? <PromotionTargetPicker label="Target products" options={productOptions} selectedIds={productTargetIds} onChange={setProductTargetIds} disabled={isPending} /> : null}
        {applicationScope === "categories" || applicationScope === "product_and_category" ? <PromotionTargetPicker label="Target categories" options={categoryOptions} selectedIds={categoryTargetIds} onChange={setCategoryTargetIds} disabled={isPending} /> : null}
        {applicationScope === "product_and_category" && <p className="text-xs text-[var(--color-text-secondary)]">A product qualifies when it matches either a selected product or a selected category.</p>}
        <label className="flex items-center gap-2 text-xs"><input name="firstPurchaseOnly" type="checkbox" defaultChecked={editing?.first_purchase_only ?? false} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /> First purchase only</label>
        <label className="block text-xs font-semibold">Storefront title (required when featured)<input name="title" maxLength={160} defaultValue={editing?.title ?? ""} className={inputClass} /></label>
        <label className="block text-xs font-semibold">Description (optional)<textarea name="description" maxLength={1000} rows={2} defaultValue={editing?.description ?? ""} className={inputClass} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs font-semibold">Storefront destination<input name="targetPath" required defaultValue={editing?.target_path ?? "/shop"} placeholder="/shop or /products/product-slug" className={inputClass} /></label>
          <label className="block text-xs font-semibold">Display priority<input name="displayPriority" type="number" min="-1000000" max="1000000" step="1" defaultValue={editing?.display_priority ?? "0"} className={inputClass} /></label>
        </div>
        <label className="flex items-center gap-2 text-xs"><input name="isFeatured" type="checkbox" defaultChecked={editing?.is_featured ?? false} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /> Feature this active discount code in the campaign banner</label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs"><input name="isAnnouncement" type="checkbox" defaultChecked={editing?.is_announcement ?? false} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /> Include this eligible code in the announcement bar</label>
          <label className="block text-xs font-semibold">Announcement priority<input name="announcementPriority" type="number" min="-1000000" max="1000000" step="1" defaultValue={editing?.announcement_priority ?? "0"} className={inputClass} /></label>
        </div>
        <label className="flex items-center gap-2 text-xs"><input name="isActive" type="checkbox" defaultChecked={editing?.is_active ?? false} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /> Active for eligible checkout</label>
        <div className="flex flex-col-reverse justify-end gap-2 pt-3 sm:flex-row sm:gap-3"><Button type="button" variant="secondary" disabled={isPending} onClick={() => setIsOpen(false)}>Cancel</Button><Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save Discount"}</Button></div>
      </form></AccessibleDialog>}
    </div>
  );
}
