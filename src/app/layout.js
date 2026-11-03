import localFont from "next/font/local";
import { ToastProvider } from "@/constants/ToastContext";
import { CartProvider } from "@/constants/CartContext";
import { WishlistProvider } from "@/constants/WishlistContext";
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
  title: {
    default: "Dr. Beauty | Beauty & Skincare",
    template: "%s | Dr. Beauty",
  },
  description:
    "Discover your beauty essentials with Dr. Beauty. Explore skincare, beauty products, and everyday favorites.",
  icons: {
    icon: "/icons/svg/logo-SVG/logo-SVG.svg", // Favicon el browser tab
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
            <WishlistProvider>{children}</WishlistProvider>
          </CartProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
