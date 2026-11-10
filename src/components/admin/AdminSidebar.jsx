"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, ClipboardList, LayoutDashboard, Layers3, MessageSquare, Package, ShoppingCart, Tags } from "lucide-react";

const navigation = [
  { label: "Overview", items: [{ name: "Dashboard", href: "/admin", icon: LayoutDashboard }] },
  { label: "Catalog", items: [
    { name: "Products", href: "/admin/products", icon: Package },
    { name: "Categories", href: "/admin/categories", icon: Layers3 },
  ] },
  { label: "Sales", items: [
    { name: "Orders", href: "/admin/orders", icon: ShoppingCart },
    { name: "Receipt archive", href: "/admin/orders/receipts", icon: Archive },
  ] },
  { label: "Marketing", items: [{ name: "Promotions", href: "/admin/promotions", icon: Tags }] },
  { label: "Customer care", items: [
    { name: "Reviews", href: "/admin/reviews", icon: MessageSquare },
    { name: "Requests", href: "/admin/requests", icon: ClipboardList },
  ] },
];

export default function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="z-30 w-full shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-64 lg:flex-col lg:overflow-y-auto lg:border-b-0 lg:border-r">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:block lg:px-5 lg:pb-6 lg:pt-7">
        <Link href="/admin" className="flex min-w-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-background)]">
            <Image src="/icons/svg/logo-SVG/logo-SVG.svg" alt="" width={30} height={30} />
          </span>
          <span className="min-w-0">
            <span className="block font-editorial text-lg font-bold leading-tight text-[var(--color-text)]">Dr. Beauty</span>
            <span className="mt-0.5 block text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--color-primary)]">Admin studio</span>
          </span>
        </Link>
      </div>

      <nav aria-label="Admin sections" className="flex items-start gap-1 overflow-x-auto px-3 pb-3 lg:block lg:flex-1 lg:space-y-5 lg:px-3 lg:pb-5">
        {navigation.map((group) => <div key={group.label} className="flex shrink-0 flex-col border-r border-[var(--color-border)] pr-1 last:border-r-0 lg:block lg:min-w-0 lg:border-0 lg:pr-0">
          <p className="px-2 pb-1 text-[8px] font-bold uppercase tracking-[0.14em] text-[var(--color-text-secondary)] lg:px-3 lg:pb-2 lg:text-[9px] lg:tracking-[0.18em]">{group.label}</p>
          <ul className="flex gap-1 lg:flex-col">
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = item.href === "/admin" ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return <li key={item.href}>
                <Link href={item.href} aria-current={active ? "page" : undefined} title={item.name} className={`group inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] lg:flex lg:min-h-11 lg:gap-3 lg:px-3.5 ${active ? "bg-[var(--color-primary-light)] text-[var(--color-rose)]" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"}`}>
                  <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-[var(--color-primary)]" : "text-[var(--color-text-secondary)] group-hover:text-[var(--color-primary)]"}`} />
                  <span className="whitespace-nowrap">{item.name}</span>
                  {active && <span className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[var(--color-primary)] lg:block" />}
                </Link>
              </li>;
            })}
          </ul>
        </div>)}
      </nav>

      <div className="mx-5 mt-auto hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 lg:block">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-primary)]">Store operations</p>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--color-text-secondary)]">Admin access is verified on the server. Changes use the existing store permissions and workflows.</p>
      </div>
      <p className="hidden px-5 pb-5 pt-4 text-[9px] text-[var(--color-text-secondary)] lg:block">DR. BEAUTY · EGYPT</p>
    </aside>
  );
}
