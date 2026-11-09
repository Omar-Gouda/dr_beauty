"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/constants/ToastContext";
import { markAdminNotificationRead, markAllAdminNotificationsRead } from "@/app/admin/actions";
import { attachNotificationPanelDismissal } from "@/lib/notification-panel-events.mjs";

function notificationTitle(eventType) {
  if (eventType === "order_created") return "New customer order";
  if (eventType === "order_cancelled") return "Order cancelled";
  if (eventType === "order_status_changed") return "Order status update";
  if (eventType === "beauty_tips_request") return "Beauty Tips request";
  if (eventType === "support_request") return "Customer support request";
  return "Store update";
}

function notificationDescription(notification) {
  if (notification.event_type === "beauty_tips_request" || notification.event_type === "support_request") {
    const category = notification.requestCategory?.replaceAll("_", " ") ?? "request";
    return `New ${category} request received.`;
  }
  const order = notification.orderNumber ? `Order #${notification.orderNumber}` : "An order";
  if (notification.event_type === "order_cancelled") return `${order} was cancelled.`;
  if (notification.event_type === "order_status_changed") return `${order} status changed.`;
  return `${order} was placed.`;
}

function notificationHref(notification) {
  if (notification.requestId) return `/admin/requests#request-${encodeURIComponent(notification.requestId)}`;
  return notification.orderNumber ? `/admin/orders#order-${encodeURIComponent(String(notification.orderNumber))}` : "/admin/orders";
}

export default function NotificationCenter({ notifications = null, hasError = false }) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState("");
  const [isPending, startTransition] = useTransition();
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const router = useRouter();
  const { showToast } = useToast();
  const unreadCount = (notifications ?? []).filter((notification) => !notification.read_at).length;

  useEffect(() => {
    if (!open) return undefined;
    return attachNotificationPanelDismissal(document, {
      trigger: triggerRef.current,
      panel: panelRef.current,
      onDismiss: () => setOpen(false),
    });
  }, [open]);

  function markOneRead(id) {
    if (isPending) return;
    setPendingId(id);
    startTransition(async () => {
      try {
        const result = await markAdminNotificationRead(id);
        showToast(result.message, result.ok ? "success" : "error");
        if (result.ok) router.refresh();
      } catch {
        showToast("The notification could not be updated. Please try again.", "error");
      } finally {
        setPendingId("");
      }
    });
  }

  function markAllRead() {
    if (isPending || unreadCount === 0) return;
    startTransition(async () => {
      try {
        const result = await markAllAdminNotificationsRead();
        showToast(result.message, result.ok ? "success" : "error");
        if (result.ok) router.refresh();
      } catch {
        showToast("Notifications could not be updated. Please try again.", "error");
      }
    });
  }

  function refreshNotifications() {
    if (isPending) return;
    startTransition(() => router.refresh());
  }

  return (
    <div className="relative">
      <div ref={triggerRef}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        aria-expanded={open}
        aria-controls="admin-notification-panel"
        onClick={() => {
          const nextOpen = !open;
          setOpen(nextOpen);
          if (nextOpen) refreshNotifications();
        }}
        className="relative min-h-10 min-w-10 rounded-full px-2"
      >
        <Bell aria-hidden="true" className="h-5 w-5" />
        {unreadCount > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>
      </div>

      {open && (
        <section ref={panelRef} id="admin-notification-panel" aria-label="Recent notifications" className="fixed left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] top-[max(4.5rem,env(safe-area-inset-top))] z-50 max-h-[calc(100dvh-6rem-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-3 sm:max-h-[min(70vh,32rem)] sm:w-[min(22rem,calc(100vw-2rem))]">
          <header className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-3 sm:gap-3 sm:px-4">
            <div className="min-w-0">
              <h2 className="font-editorial text-base font-bold text-[var(--color-text)]">Notifications</h2>
              <p className="text-[11px] text-[var(--color-text-secondary)]">Persistent store and customer requests</p>
            </div>
            <div className="flex shrink-0 items-center">
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={refreshNotifications} aria-label="Refresh notifications" title="Refresh notifications" className="min-h-9 min-w-9 px-2">
                <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={isPending || unreadCount === 0} onClick={markAllRead} aria-label="Mark all notifications as read" className="gap-1.5 px-2 text-[11px]">
                <CheckCheck aria-hidden="true" className="h-4 w-4" /> Mark all read
              </Button>
            </div>
          </header>

          {hasError ? (
            <p role="status" className="p-5 text-sm text-[var(--color-text-secondary)]">{hasError === "migration_missing"
              ? "The admin notification tables are not available yet. Apply the reviewed admin notification migrations to enable this inbox."
              : hasError === "schema_mismatch"
                ? "The admin notification database structure does not match this app version. Ask a project administrator to review the migration state."
                : hasError === "permission_denied"
                  ? "Your account could not read the admin notification inbox. Verify the admin role and notification access policies."
                  : "Notifications are temporarily unavailable. Retry shortly or ask an administrator to check the server diagnostics."}</p>
          ) : isPending ? (
            <p role="status" className="p-5 text-sm text-[var(--color-text-secondary)]">Refreshing notifications…</p>
          ) : !notifications?.length ? (
              <p className="p-5 text-sm text-[var(--color-text-secondary)]">You’re all caught up. New orders and customer requests will appear here.</p>
          ) : (
            <ul className="max-h-[calc(100dvh-12rem-env(safe-area-inset-bottom))] divide-y divide-[var(--color-border)] overflow-y-auto sm:max-h-[min(56vh,25rem)]">
              {notifications.map((notification) => (
                <li key={notification.id} className={`flex items-start gap-3 px-4 py-3 ${notification.read_at ? "" : "bg-[var(--color-primary-light)]/40"}`}>
                  <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.read_at ? "bg-transparent" : "bg-[var(--color-primary)]"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--color-text)]">{notificationTitle(notification.event_type)}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{notificationDescription(notification)}</p>
                    <time dateTime={notification.created_at} className="mt-1 block text-[10px] text-[var(--color-text-secondary)]">{notification.createdLabel}</time>
                    <Link href={notificationHref(notification)} onClick={() => setOpen(false)} className="mt-2 inline-block text-xs font-semibold text-[var(--color-primary)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
                      {notification.requestId ? "Review request" : "View order"}
                    </Link>
                  </div>
                  {!notification.read_at && (
                    <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => markOneRead(notification.id)} aria-label={`Mark ${notificationTitle(notification.event_type)} as read`} className="min-h-9 min-w-9 px-2" title={pendingId === notification.id ? "Saving" : "Mark as read"}>
                      <Check aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
