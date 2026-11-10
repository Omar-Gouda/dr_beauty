"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight, ChevronRight } from "lucide-react";
import NotificationCenter from "@/components/admin/NotificationCenter";

const pageTitles = [
  ["/admin/products", "Products"],
  ["/admin/categories", "Categories"],
  ["/admin/orders/receipts", "Receipt archive"],
  ["/admin/orders", "Orders"],
  ["/admin/promotions", "Promotions"],
  ["/admin/reviews", "Reviews"],
  ["/admin/requests", "Customer requests"],
];

function getPageTitle(pathname) {
  if (pathname === "/admin") return "Overview";
  return pageTitles.find(([href]) => pathname === href || pathname.startsWith(`${href}/`))?.[1] ?? "Admin";
}

export default function AdminHeader({ userEmail = "", notifications = null, notificationError = false }) {
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header className="sticky top-0 z-20 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 px-4 py-3 backdrop-blur sm:px-6 lg:px-9">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
          <span>Admin studio</span><ChevronRight aria-hidden="true" className="h-3 w-3" /><span className="text-[var(--color-primary)]">{title}</span>
        </nav>
        <p className="mt-1 truncate text-xs text-[var(--color-text-secondary)]">Store operations · Dr. Beauty</p>
      </div>
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {userEmail && <span className="hidden max-w-48 truncate text-[10px] text-[var(--color-text-secondary)] xl:inline" title={userEmail}>{userEmail}</span>}
        <NotificationCenter notifications={notifications} hasError={notificationError} />
        <Link href="/" className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[10px] font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-rose)] hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] sm:px-4 sm:text-xs">
          Back to the Store <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}
