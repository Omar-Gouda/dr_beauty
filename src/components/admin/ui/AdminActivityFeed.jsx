"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Bell, Check } from "lucide-react";
import { markAdminNotificationRead } from "@/app/admin/actions";
import { useToast } from "@/constants/ToastContext";
import AdminEmptyState from "@/components/admin/ui/AdminEmptyState";
import AdminStatusBadge from "@/components/admin/ui/AdminStatusBadge";

function getActivityContent(activity) {
  if (activity.type === "order_created") return { title: `New order${activity.orderNumber ? ` #${activity.orderNumber}` : ""}`, detail: "A customer placed an order.", href: activity.orderNumber ? `/admin/orders?q=${encodeURIComponent(String(activity.orderNumber))}` : "/admin/orders", badge: "Order" };
  if (activity.type === "order_cancelled") return { title: `Order${activity.orderNumber ? ` #${activity.orderNumber}` : ""} cancelled`, detail: "Review the cancellation and inventory status.", href: activity.orderNumber ? `/admin/orders?q=${encodeURIComponent(String(activity.orderNumber))}` : "/admin/orders", badge: "Cancelled" };
  if (activity.type === "order_status_changed") return { title: `Order${activity.orderNumber ? ` #${activity.orderNumber}` : ""} updated`, detail: "An order lifecycle event was recorded.", href: "/admin/orders", badge: "Order" };
  if (["beauty_tips_request", "beauty_tips", "consultation"].includes(activity.type)) return { title: "Consultation request", detail: activity.detail || "A customer requested a consultation.", href: activity.href ?? (activity.requestId ? `/admin/requests#request-${activity.requestId}` : "/admin/requests"), badge: "Consultation" };
  if (["support_request", "support"].includes(activity.type)) return { title: "Support request", detail: activity.detail || "A customer sent a support request.", href: activity.href ?? (activity.requestId ? `/admin/requests#request-${activity.requestId}` : "/admin/requests"), badge: "Support" };
  if (activity.type === "new_review") return { title: activity.title || "New product review", detail: activity.detail || "Review customer-submitted content.", href: "/admin/reviews", badge: "Review" };
  return { title: activity.title || "Customer activity", detail: activity.detail || "Review the latest customer activity.", href: activity.href || "/admin/requests", badge: "Activity" };
}

export default function AdminActivityFeed({ activities = [], partial = false, limitation = "" }) {
  const [pending, startTransition] = useTransition();
  const { showToast } = useToast();
  const router = useRouter();

  function markRead(id) {
    startTransition(async () => {
      const result = await markAdminNotificationRead(id);
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) router.refresh();
    });
  }

  if (!activities.length) return <AdminEmptyState title="No recent activity" description="New orders, reviews, and customer requests will appear here." icon={Bell} />;

  return <div>
    {partial && <p role="status" className="mb-3 rounded-xl bg-[var(--color-background)] px-3 py-2 text-[10px] text-[var(--color-text-secondary)]">{limitation || "Some activity sources are unavailable; the events below may be incomplete."}</p>}
    <ol className="divide-y divide-[var(--color-border)]">
      {activities.map((activity) => {
        const content = getActivityContent(activity);
        return <li key={activity.id} className="flex min-w-0 items-start gap-3 py-3 first:pt-0 last:pb-0">
          <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${activity.notificationId && !activity.readAt ? "bg-[var(--color-primary)]" : "bg-[var(--color-border)]"}`} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link href={content.href} className="break-words text-xs font-semibold text-[var(--color-text)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">{content.title}</Link>
              <AdminStatusBadge tone={content.badge === "Cancelled" ? "warning" : content.badge === "Order" ? "rose" : "muted"}>{content.badge}</AdminStatusBadge>
              {activity.notificationId && !activity.readAt && <span className="text-[9px] font-semibold text-[var(--color-primary)]">Unread</span>}
            </div>
            <p className="mt-1 text-[10px] text-[var(--color-text-secondary)]">{content.detail}</p>
            <time dateTime={activity.createdAt} className="mt-1 block text-[9px] text-[var(--color-text-secondary)]">{new Intl.DateTimeFormat("en-EG", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(activity.createdAt))} UTC</time>
          </div>
          {activity.notificationId && !activity.readAt && <button type="button" disabled={pending} onClick={() => markRead(activity.notificationId)} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-2 text-[10px] font-semibold text-[var(--color-primary)] hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] disabled:opacity-50" aria-label={`Mark ${content.title} as read`}><Check aria-hidden="true" className="h-3.5 w-3.5" /><span className="hidden sm:inline">Read</span></button>}
        </li>;
      })}
    </ol>
  </div>;
}
