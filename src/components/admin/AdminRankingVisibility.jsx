"use client";

import { useState, useTransition } from "react";
import Button from "@/components/ui/Button";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import { useToast } from "@/constants/ToastContext";
import { updateStorefrontRankingVisibility } from "@/app/admin/actions";

export default function AdminRankingVisibility({ settings }) {
  const [showLovedByDrBeauty, setShowLovedByDrBeauty] = useState(settings?.showLovedByDrBeauty === true);
  const [showDrBeautyElites, setShowDrBeautyElites] = useState(settings?.showDrBeautyElites === true);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();

  if (!settings) return <AdminEmptyState title="Ranking controls unavailable" description="Apply the local public ranking visibility migration to manage these store sections." />;

  function save(event) {
    event.preventDefault();
    if (isPending) return;
    const nextSettings = { showLovedByDrBeauty, showDrBeautyElites };
    startTransition(async () => {
      const result = await updateStorefrontRankingVisibility(nextSettings);
      showToast(result.message, result.ok ? "success" : "error");
    });
  }

  return <form onSubmit={save} aria-labelledby="public-ranking-settings-title" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 id="public-ranking-settings-title" className="font-editorial text-lg font-semibold text-[var(--color-text)]">Public customer highlights</h3><p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">Both sections start hidden. Names still follow each customer’s profile privacy choice.</p></div><Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save visibility"}</Button></div>
    <fieldset disabled={isPending} className="mt-4 grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">Choose which customer rankings appear in the store</legend>
      <label className="flex min-h-12 items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"><input type="checkbox" checked={showLovedByDrBeauty} onChange={(event) => setShowLovedByDrBeauty(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /><span><span className="block font-semibold">Loved by DR. Beauty</span><span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">Top five customers by delivered orders.</span></span></label>
      <label className="flex min-h-12 items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm"><input type="checkbox" checked={showDrBeautyElites} onChange={(event) => setShowDrBeautyElites(event.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /><span><span className="block font-semibold">DR. Beauty Elites</span><span className="mt-0.5 block text-xs text-[var(--color-text-secondary)]">Top three by paid delivered order value.</span></span></label>
    </fieldset>
  </form>;
}
