"use client";

import Link from "next/link";
import Image from "next/image";
import Container from "@/components/ui/Container";
import SearchBar from "@/components/layout/SearchBar";
import { User, Heart, ShoppingBag, Search, X, Menu, ArrowRight, Package, Info, Sparkles, LifeBuoy, MapPin, UserPlus, LogIn } from "lucide-react";
import { useCart } from "@/constants/CartContext";
import { useWishlist } from "@/constants/WishlistContext";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AccessibleDialog from "@/components/ui/AccessibleDialog";
import MobileSignOutForm from "@/components/layout/MobileSignOutForm";

const exploreLinks = [
  { href: "/", label: "Home", icon: ArrowRight },
  { href: "/shop", label: "Shop all", icon: ShoppingBag },
  { href: "/offers", label: "Offers", icon: Sparkles },
  { href: "/beauty-tips", label: "Beauty Tips", icon: Info },
  { href: "/about", label: "About Dr. Beauty", icon: User },
  { href: "/support", label: "Support", icon: LifeBuoy },
];

export default function Navbar({ mobileOnly = false, desktopOnly = false, initialAuthenticated = null }) {
  const { totalItems } = useCart();
  const { wishlistItems } = useWishlist();
  const [sessionAuthenticated, setSessionAuthenticated] = useState(null);
  const authenticated = sessionAuthenticated ?? initialAuthenticated;
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuClosing, setMobileMenuClosing] = useState(false);
  const menuCloseTimer = useRef(null);

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    let subscription = null;

    try {
      const supabase = createClient();
      ({ data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        authEventReceived = true;
        if (active) setSessionAuthenticated(Boolean(session?.user));
      }));
      supabase.auth.getUser().then(({ data: { user }, error }) => {
        if (active && !authEventReceived) setSessionAuthenticated(!error && Boolean(user));
      }).catch(() => {
        if (active && !authEventReceived) setSessionAuthenticated(false);
      });
    } catch {
      // Keep the server-resolved snapshot; the browser client may be unavailable.
    }

    return () => {
      active = false;
      subscription?.unsubscribe();
    };
  }, [initialAuthenticated]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [mobileMenuOpen]);

  useEffect(() => () => {
    if (menuCloseTimer.current) clearTimeout(menuCloseTimer.current);
  }, []);

  function openMobileMenu() {
    if (menuCloseTimer.current) clearTimeout(menuCloseTimer.current);
    setMobileSearchOpen(false);
    setMobileMenuClosing(false);
    setMobileMenuOpen(true);
  }

  function closeMobileMenu() {
    if (!mobileMenuOpen || mobileMenuClosing) return;
    setMobileMenuClosing(true);
    menuCloseTimer.current = setTimeout(() => {
      setMobileMenuOpen(false);
      setMobileMenuClosing(false);
      menuCloseTimer.current = null;
    }, 180);
  }

  const accountHref = authenticated ? "/profile" : "/login";
  return (
    <header className={`relative z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)] ${mobileOnly ? "lg:hidden" : desktopOnly ? "hidden lg:block" : ""}`}>
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
                <span className="text-[8.5px] font-normal tracking-widest text-[var(--color-text-secondary)]">
                  by Dr. Radwa Hassan
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
            {authenticated === true ? (
              <Link href="/profile" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
                <User aria-hidden="true" className="h-5 w-5" />
              </Link>
            ) : authenticated === false ? (
              <div className="flex items-center gap-3">
                <Link href="/login" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium transition-colors hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">Sign In</Link>
                <Link href="/register" className="inline-flex min-h-11 items-center rounded-full bg-[var(--color-primary)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] focus-visible:ring-offset-2">Create Account</Link>
              </div>
            ) : (
              <span role="status" className="px-3 text-sm text-[var(--color-text-secondary)]">Checking account…</span>
            )}
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
          <div className="flex min-h-16 items-center justify-between gap-2">
            <Link href="/" aria-label="Dr. Beauty - Home" className="flex min-w-0 items-center gap-2 text-[var(--color-text)]">
              <Image src="/icons/svg/logo-SVG/logo-SVG.svg" alt="" width={32} height={32} className="h-8 w-8 shrink-0" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate font-editorial text-lg font-bold">DR. Beauty</span>
                <span className="truncate text-[9px] font-medium tracking-wide text-[var(--color-text-secondary)]">Dr. Radwa Hassan</span>
              </span>
            </Link>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-store-navigation-dialog"
                onClick={openMobileMenu}
                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-[var(--color-text)] hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
              ><Menu aria-hidden="true" className="h-5 w-5" /></button>
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
      {mobileMenuOpen && <AccessibleDialog onClose={closeMobileMenu} labelledBy="mobile-store-navigation-title" className="mobile-menu-dialog">
        <div id="mobile-store-navigation-dialog" className={`mobile-menu-panel ${mobileMenuClosing ? "is-closing" : ""}`}>
          <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-5">
            <div><p className="mobile-menu-accent text-[10px] font-bold uppercase tracking-[0.2em]">Explore</p><h2 id="mobile-store-navigation-title" className="mt-1 font-editorial text-2xl font-bold text-[var(--color-text)]">Dr. Beauty</h2><p className="mobile-menu-muted mt-1 text-xs">Dr. Radwa Hassan</p></div>
            <button type="button" aria-label="Close navigation menu" onClick={closeMobileMenu} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><X aria-hidden="true" className="h-5 w-5" /></button>
          </div>
          <nav aria-label="Store navigation" className="mt-5">
            <p className="mobile-menu-muted px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.16em]">Discover</p>
            <ul className="space-y-1">{exploreLinks.map(({ href, label, icon: Icon }) => <li key={href}><Link href={href} onClick={closeMobileMenu} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><Icon aria-hidden="true" className="mobile-menu-accent h-4 w-4" />{label}</Link></li>)}</ul>
            <p className="mobile-menu-muted mt-6 px-3 pb-2 text-[11px] font-bold uppercase tracking-[0.16em]">Your account</p>
            <ul className="space-y-1">
              {authenticated === true ? <>
                <li><Link href="/profile" onClick={closeMobileMenu} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><User aria-hidden="true" className="mobile-menu-accent h-4 w-4" />My Profile</Link></li>
                <li><Link href="/orders" onClick={closeMobileMenu} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><Package aria-hidden="true" className="mobile-menu-accent h-4 w-4" />My Orders</Link></li>
                <li><Link href="/addresses" onClick={closeMobileMenu} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><MapPin aria-hidden="true" className="mobile-menu-accent h-4 w-4" />Address book</Link></li>
                <li><MobileSignOutForm onSubmit={closeMobileMenu} /></li>
              </> : authenticated === false ? <>
                <li><Link href={accountHref} onClick={closeMobileMenu} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><LogIn aria-hidden="true" className="mobile-menu-accent h-4 w-4" />Sign In</Link></li>
                <li><Link href="/register" onClick={closeMobileMenu} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><UserPlus aria-hidden="true" className="mobile-menu-accent h-4 w-4" />Create Account</Link></li>
              </> : <li role="status" className="px-3 py-3 text-sm text-[var(--color-text-secondary)]">Checking account…</li>}
              <li><Link href="/wishlist" onClick={closeMobileMenu} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[var(--color-text)] transition-colors hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><Heart aria-hidden="true" className="mobile-menu-accent h-4 w-4" />Wishlist{wishlistItems.length > 0 ? ` · ${wishlistItems.length}` : ""}</Link></li>
            </ul>
          </nav>
        </div>
      </AccessibleDialog>}
    </header>
  );
}
