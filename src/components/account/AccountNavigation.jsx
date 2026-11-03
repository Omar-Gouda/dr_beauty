"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, House, MapPin, Package, ShoppingBag, UserRound } from "lucide-react";
import { logout } from "@/app/(account)/actions";

const links = [
  { href: "/", label: "Home", icon: House },
  { href: "/profile", label: "Profile", icon: UserRound },
  { href: "/addresses", label: "Address book", icon: MapPin },
  { href: "/orders", label: "Orders", icon: Package },
  { href: "/wishlist", label: "Wishlist", icon: Heart, local: true },
  { href: "/cart", label: "Shopping bag", icon: ShoppingBag, local: true },
];

export default function AccountNavigation() {
  const pathname = usePathname();

  return (
    <nav aria-label="Account navigation" className="mb-7 hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-sm lg:block">
      <ul className="flex gap-2 overflow-x-auto">
        {links.map(({ href, label, icon: Icon, local }) => {
          const active = pathname === href || (href === "/orders" && pathname.startsWith("/orders/"));
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                title={local ? `${label}, saved in this browser` : label}
                className={`inline-flex min-h-11 items-center gap-2 rounded-xl px-3 sm:px-4 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] ${active ? "bg-[var(--color-primary)] text-white" : "text-[var(--color-text-secondary)] hover:bg-[var(--color-primary-light)] hover:text-[var(--color-text)]"}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{label}</span>
                {local && <span className="hidden text-[9px] font-normal opacity-75 sm:inline">on this device</span>}
              </Link>
            </li>
          );
        })}
        <li className="shrink-0">
          <form action={logout}>
            <button type="submit" className="inline-flex min-h-11 items-center rounded-xl px-3 sm:px-4 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-primary-light)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
              Sign out
            </button>
          </form>
        </li>
      </ul>
    </nav>
  );
}
