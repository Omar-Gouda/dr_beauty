import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import NotificationCenter from "@/components/admin/NotificationCenter";

export default function AdminHeader({ userEmail = "", notifications = null, notificationError = false }) {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 sm:px-6 lg:px-10">
      <div className="min-w-0">
        <p className="font-editorial text-lg font-semibold text-[var(--color-text)] sm:text-xl">Store administration</p>
        <p className="truncate text-xs text-[var(--color-text-secondary)]">Catalog, categories, orders, and customer reviews</p>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <NotificationCenter notifications={notifications} hasError={notificationError} />
        {userEmail && <span className="hidden max-w-56 truncate border-l border-[var(--color-border)] pl-3 text-xs text-[var(--color-text-secondary)] sm:block">{userEmail}</span>}
        <Link href="/" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-rose)] hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
          Storefront <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </header>
  );
}
