"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Heart, House, ShoppingBag, UserRound } from "lucide-react";

const destinations = [
  { href: "/", label: "Home", icon: House },
  { href: "/shop", label: "Shop", icon: ShoppingBag },
  { href: "/wishlist", label: "Wishlist", icon: Heart },
  { href: "/profile", label: "Account", icon: UserRound },
];

function isCurrentDestination(pathname, href) {
  if (href === "/") return pathname === "/";
  if (href === "/shop") {
    return ["/shop", "/products/", "/categories/", "/offers", "/beauty-tips"].some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix),
    );
  }
  if (href === "/wishlist") return pathname === href;
  return ["/profile", "/addresses", "/orders", "/login", "/register", "/forgot-password", "/reset-password"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function MobileNavigationLinks({ pathname = "" }) {
  return destinations.map(({ href, label, icon: Icon }) => {
    const current = pathname ? isCurrentDestination(pathname, href) : false;
    return (
      <Link
        key={href}
        href={href}
        aria-current={current ? "page" : undefined}
        aria-label={label}
        className={`mobile-bottom-nav__link ${current ? "is-current" : ""}`}
      >
        <Icon aria-hidden="true" className="h-5 w-5" strokeWidth={current ? 2.2 : 1.8} />
        <span>{label}</span>
      </Link>
    );
  });
}

function PathnameAwareNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main mobile navigation" className="mobile-bottom-nav">
      <MobileNavigationLinks pathname={pathname} />
    </nav>
  );
}

function MobileNavigationFallback() {
  return (
    <nav aria-label="Main mobile navigation" className="mobile-bottom-nav">
      <MobileNavigationLinks />
    </nav>
  );
}

export default function MobileBottomNavigation() {
  return (
    <Suspense fallback={<MobileNavigationFallback />}>
      <PathnameAwareNavigation />
    </Suspense>
  );
}
