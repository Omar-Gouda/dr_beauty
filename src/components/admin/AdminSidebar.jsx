"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageSquare, Package, ShoppingCart, Layers3, ShieldAlert, ClipboardList, Tags } from "lucide-react";

const navItems = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Products", href: "/admin/products", icon: Package },
  { name: "Categories", href: "/admin/categories", icon: Layers3 },
  { name: "Discounts & offers", href: "/admin/promotions", icon: Tags },
  { name: "Orders", href: "/admin/orders", icon: ShoppingCart },
  { name: "Reviews", href: "/admin/reviews", icon: MessageSquare },
  { name: "Requests", href: "/admin/requests", icon: ClipboardList },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="min-w-0 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:p-4 lg:flex lg:min-h-screen lg:w-64 lg:flex-col lg:border-b-0 lg:border-r lg:p-6">
      <Link href="/" className="mb-4 flex w-fit items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] md:mb-10">
        <Image src="/icons/svg/logo-SVG/logo-SVG.svg" alt="" width={40} height={40} className="h-10 w-10 rounded-full" />
        <span>
          <span className="block font-editorial text-base font-bold text-[var(--color-text)]">Dr. Beauty</span>
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-primary)]">Admin Portal</span>
        </span>
      </Link>

      <nav aria-label="Admin sections" className="-mx-1 flex gap-2 overflow-x-auto pb-1 lg:mx-0 lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/admin" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] lg:gap-3 lg:px-4 lg:py-3 ${
                active
                  ? "bg-[var(--color-primary)] text-white shadow-sm"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
              }`}
            >
              <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 hidden items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 lg:flex">
        <ShieldAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
        <div className="text-[10px] text-[var(--color-text-secondary)]">
          <p className="mb-0.5 font-bold text-[var(--color-text)]">Secure mode</p>
          Admin access is verified on the server.
        </div>
      </div>
    </aside>
  );
}
