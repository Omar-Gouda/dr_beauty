import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileBottomNavigation from "@/components/layout/MobileBottomNavigation";

export default function CheckoutLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] text-[var(--color-text)] md:pb-0">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
      <MobileBottomNavigation />
    </div>
  );
}
