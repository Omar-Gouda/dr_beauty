import Footer from "@/components/layout/Footer";
import MobileBottomNavigation from "@/components/layout/MobileBottomNavigation";
import Navbar from "@/components/layout/Navbar";

export default function AccountLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
      <Navbar mobileOnly />
      <div className="flex-1">{children}</div>
      <Footer mobileOnly />
      <MobileBottomNavigation />
    </div>
  );
}
