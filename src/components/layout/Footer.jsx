import Link from "next/link";
import Container from "@/components/ui/Container";

const footerLinks = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop Now" },
  { href: "/offers", label: "Offers & Discount Codes" },
  { href: "/beauty-tips", label: "Beauty Tips" },
  { href: "/about", label: "About Dr. Beauty" },
  { href: "/support", label: "Contact Support" },
  { href: "/login", label: "My Account" },
  { href: "/register", label: "Create Account" },
  { href: "/orders", label: "Order History" },
  { href: "/wishlist", label: "Wishlist" },
];

const legalLinks = [
  { href: "/terms-and-conditions", label: "Terms & Conditions" },
  { href: "/privacy-policy", label: "Privacy Policy" },
];

export default function Footer({ mobileOnly = false, desktopOnly = false }) {
  return (
    <footer className={`mt-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] ${mobileOnly ? "lg:hidden" : desktopOnly ? "hidden lg:block" : ""}`}>
      <div className={mobileOnly ? "hidden" : "hidden lg:block"}>
      <Container>
        <div className="grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Link
              href="/"
              className="font-editorial text-2xl font-bold text-[var(--color-primary)]"
            >
              Dr. Beauty
            </Link>

            <p className="mt-3 max-w-sm text-sm leading-7 text-[var(--color-text-secondary)]">
              Discover science-based skincare and beauty essentials tailored for healthy, confident skin.
            </p>
          </div>

          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              Quick Links
            </h3>

            <ul className="mt-4 space-y-3">
              {footerLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="inline-flex min-h-11 items-center text-sm text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-primary)] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              Customer Care
            </h3>

            <p className="mt-4 text-sm leading-7 text-[var(--color-text-secondary)]">
              Review your order status and shipment updates from your account.
            </p>
            <Link href="/orders" className="mt-3 inline-block text-sm font-semibold text-[var(--color-primary)] hover:underline">
              View order history
            </Link>
            <p className="mt-3 text-sm leading-7 text-[var(--color-text-secondary)]">Need help with an order or product question?</p>
            <Link href="/support" className="mt-2 inline-block text-sm font-semibold text-[var(--color-primary)] hover:underline">Contact support</Link>
            <h4 className="mt-6 text-sm font-semibold text-[var(--color-text)]">Policies</h4>
            <ul className="mt-2 space-y-1">
              {legalLinks.map((link) => <li key={link.href}><Link href={link.href} className="inline-flex min-h-11 items-center text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]">{link.label}</Link></li>)}
            </ul>
          </div>
        </div>

      </Container>
      </div>

      <div className="lg:hidden">
        <Container className="py-6">
          <Link href="/" className="font-editorial text-xl font-bold text-[var(--color-primary)]">Dr. Beauty</Link>
          <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--color-text-secondary)]">
            Science-based skincare and beauty essentials for healthy, confident skin.
          </p>
          <nav aria-label="Policies" className="mt-5 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-[var(--color-border)] pt-4">
            {legalLinks.map((link) => (
              <Link key={link.href} href={link.href} className="inline-flex min-h-11 items-center text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] focus-visible:rounded focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
                {link.label}
              </Link>
            ))}
          </nav>
        </Container>
      </div>
      <Container>
        <div className="flex flex-col items-center justify-between gap-2 border-t border-[var(--color-border)] py-5 text-center sm:flex-row sm:text-left">
          <p className="text-xs text-[var(--color-text-secondary)]">© 2026 Dr. Beauty. All rights reserved.</p>
          <p className="text-xs text-[var(--color-text-secondary)]">Developed by <a href="mailto:omarg.dev1@gmail.com" className="font-editorial text-sm font-semibold text-[var(--color-rose)] transition-colors hover:text-[var(--color-primary-hover)] focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">Omar Gouda</a></p>
        </div>
      </Container>
    </footer>
  );
}
