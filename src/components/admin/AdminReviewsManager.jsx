"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moderateProductReview } from "@/app/admin/actions";
import { useToast } from "@/constants/ToastContext";
import Button from "@/components/ui/Button";

export default function AdminReviewsManager({ reviews }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();

  function moderate(reviewId, status) {
    const formData = new FormData();
    formData.set("reviewId", reviewId);
    formData.set("status", status);
    startTransition(async () => {
      const result = await moderateProductReview(formData);
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) router.refresh();
    });
  }

  return (
    <section className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-[var(--color-primary)]">Store management</p>
        <h1 className="mt-2 font-editorial text-3xl font-bold text-[var(--color-text)]">Product Reviews</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">New eligible reviews appear immediately. Use this page to review or remove content that needs attention.</p>
      </header>

      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">There are no reviews requiring attention.</div>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <article key={review.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-[var(--color-text)]">{review.product?.name ?? "Product"}</h2>
                  <span className="mt-2 inline-flex rounded-full border border-[var(--color-border)] px-2 py-1 text-[10px] font-semibold capitalize">{review.status}</span>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{review.rating} / 5 · {new Date(review.created_at).toLocaleDateString("en-EG", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</p>
                </div>
              </div>
              {review.title && <h3 className="mt-4 font-semibold text-[var(--color-text)]">{review.title}</h3>}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-secondary)]">{review.body}</p>
              <div className="mt-5 flex flex-wrap gap-3">
                {review.status === "pending" && <Button type="button" disabled={pending} onClick={() => moderate(review.id, "approved")}>Publish</Button>}
                <Button type="button" variant="outline" disabled={pending} onClick={() => moderate(review.id, "rejected")}>Remove from storefront</Button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
