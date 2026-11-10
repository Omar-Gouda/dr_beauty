import localFont from "next/font/local";
import { Suspense } from "react";
import { ToastProvider } from "@/constants/ToastContext";
import { CartProvider } from "@/constants/CartContext";
import { WishlistProvider } from "@/constants/WishlistContext";
import VisitorTracker from "@/components/analytics/VisitorTracker";
import "./globals.css";

const editorialFont = localFont({
  src: "../../public/fonts/CormorantGaramond-latin.woff2",
  variable: "--font-editorial",
  weight: "400 700",
  display: "swap",
});

const bodyFont = localFont({
  src: "../../public/fonts/Manrope-latin.woff2",
  variable: "--font-body",
  weight: "400 800",
  display: "swap",
});

export const metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://drbeauty-gilt.vercel.app"),
  title: {
    default: "Dr. Beauty | Beauty & Skincare",
    template: "%s | Dr. Beauty",
  },
  description:
    "Discover your beauty essentials with Dr. Beauty. Explore skincare, beauty products, and everyday favorites.",
  openGraph: {
    type: "website",
    siteName: "Dr. Beauty",
    title: "Dr. Beauty | Beauty & Skincare",
    description: "Discover thoughtful skincare and beauty essentials selected by Dr. Radwa Hassan.",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Dr. Beauty by Dr. Radwa Hassan" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Dr. Beauty | Beauty & Skincare",
    description: "Discover thoughtful skincare and beauty essentials selected by Dr. Radwa Hassan.",
    images: [{ url: "/opengraph-image", alt: "Dr. Beauty by Dr. Radwa Hassan" }],
  },
  icons: {
    icon: "/icons/svg/logo-SVG/logo-SVG.svg",
    apple: "/icons/svg/logo-SVG/logo-SVG.svg",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${editorialFont.variable} ${bodyFont.variable} antialiased`}
    >
      <body className="flex min-h-screen flex-col bg-[var(--color-background)] text-[var(--color-text)]">
        <ToastProvider>
          <CartProvider>
            <WishlistProvider>
              <Suspense fallback={null}><VisitorTracker /></Suspense>
              {children}
            </WishlistProvider>
          </CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
