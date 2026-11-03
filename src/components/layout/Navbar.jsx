"use client";

import Link from "next/link";
import Image from "next/image";
import Container from "@/components/ui/Container";
import SearchBar from "@/components/layout/SearchBar";
import { User, Heart, ShoppingBag, Search, X } from "lucide-react";
import { useCart } from "@/constants/CartContext";
import { useWishlist } from "@/constants/WishlistContext";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function Navbar({ mobileOnly = false }) {
  const { totalItems } = useCart();
  const { wishlistItems } = useWishlist();
  const [authenticated, setAuthenticated] = useState(null);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  useEffect(() => {
    let active = true;
    let receivedAuthEvent = false;
    let subscription;

    if (mobileOnly) return undefined;

    try {
      const supabase = createClient();
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (active && !receivedAuthEvent) setAuthenticated(Boolean(session));
      }).catch(() => {
        if (active && !receivedAuthEvent) setAuthenticated(false);
      });

      ({ data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        receivedAuthEvent = true;
        if (active) setAuthenticated(Boolean(session));
      }));
    } catch {
      // Keep the neutral account destination; protected pages verify the session.
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [mobileOnly]);

  const accountHref = mobileOnly ? "/profile" : authenticated ? "/profile" : authenticated === false ? "/login" : "/profile";
  const accountLabel = mobileOnly ? "Account" : authenticated ? "My account" : authenticated === false ? "Sign in" : "Account";
  return (
    <header className={`relative z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)] ${mobileOnly ? "lg:hidden" : ""}`}>
      <div className={mobileOnly ? "hidden" : "hidden lg:block"}>
      <Container>
        <div className="flex min-h-20 items-center justify-between gap-4">
          <div className="flex items-center">
            <Link
              href="/"
              aria-label="Dr. Beauty - Home"
              className="flex items-center gap-3 text-lg font-bold tracking-tight text-[var(--color-primary)]"
            >
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                <Image 
                  src="/icons/svg/logo-SVG/logo-SVG.svg" 
                  alt="Dr. Beauty Logo" 
                  width={36} 
                  height={36} 
                  className="object-contain"
                />
              </div>
              
              <div className="flex min-w-0 flex-col truncate">
                <span className="truncate font-editorial text-2xl font-bold tracking-normal text-[var(--color-text)]">
                  Dr. Beauty
                </span>
                <span className="text-[8.5px] font-normal uppercase tracking-widest text-[var(--color-text-secondary)]">
                  by DR. Radwa Hassan
                </span>
              </div>
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <nav aria-label="Main Navigation" className="flex shrink-0 items-center gap-5 xl:gap-7">
            <Link href="/" className="text-sm font-medium text-[var(--color-text)] transition-colors hover:text-[var(--color-primary)]">
              Home
            </Link>
            <Link href="/shop" className="text-sm font-medium text-[var(--color-text)] transition-colors hover:text-[var(--color-primary)]">
              Shop
            </Link>
            <Link href="/offers" className="text-sm font-medium text-[var(--color-text)] transition-colors hover:text-[var(--color-primary)]">
              Offers
            </Link>
            <Link href="/beauty-tips" className="text-sm font-medium text-[var(--color-text)] transition-colors hover:text-[var(--color-primary)]">
              Beauty Tips
            </Link>
            <Link href="/support" className="text-sm font-medium text-[var(--color-text)] transition-colors hover:text-[var(--color-primary)]">
              Support
            </Link>
          </nav>

          {/* Search Bar (Desktop) */}
          <div className="max-w-sm min-w-[16rem] flex-1">
            <SearchBar />
          </div>

          <div className="flex shrink-0 items-center gap-2 text-[var(--color-text)]">
            <Link href={accountHref} aria-label={accountLabel} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:text-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
              <User className="h-5 w-5" />
            </Link>
            <Link href="/wishlist" aria-label="Wishlist" className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:text-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
              <Heart className="h-5 w-5" />
              {wishlistItems.length > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] text-white">
                  {wishlistItems.length > 99 ? "99+" : wishlistItems.length}
                </span>
              )}
            </Link>
            <Link href="/cart" aria-label={`Cart${totalItems ? `, ${totalItems} items` : ""}`} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:text-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
              <ShoppingBag className="h-5 w-5" />
              {totalItems > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-primary)] text-[10px] text-white">
                  {totalItems > 99 ? "99+" : totalItems}
                </span>
              )}
            </Link>
          </div>

        </div>

      </Container>
      </div>

      <div className="lg:hidden">
        <Container>
          <div className="flex min-h-16 items-center justify-between gap-3">
            <Link href="/" aria-label="Dr. Beauty - Home" className="flex min-w-0 items-center gap-2 text-[var(--color-text)]">
              <Image src="/icons/svg/logo-SVG/logo-SVG.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
              <span className="truncate font-editorial text-xl font-bold">Dr. Beauty</span>
            </Link>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                aria-label={mobileSearchOpen ? "Close search" : "Open search"}
                aria-expanded={mobileSearchOpen}
                aria-controls="mobile-store-search"
                onClick={() => setMobileSearchOpen((open) => !open)}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--color-text)] hover:bg-[var(--color-primary-light)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
              >
                {mobileSearchOpen ? <X aria-hidden="true" className="h-5 w-5" /> : <Search aria-hidden="true" className="h-5 w-5" />}
              </button>
              <Link href="/cart" aria-label={`Shopping bag${totalItems ? `, ${totalItems} items` : ""}`} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--color-text)] hover:bg-[var(--color-primary-light)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
                <ShoppingBag aria-hidden="true" className="h-5 w-5" />
                {totalItems > 0 && <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[10px] text-white">{totalItems > 99 ? "99+" : totalItems}</span>}
              </Link>
            </div>
          </div>
          <div id="mobile-store-search" className={`pb-3 ${mobileSearchOpen ? "" : "hidden"}`}><SearchBar id="store-search-mobile" /></div>
        </Container>
      </div>
    </header>
  );
}
