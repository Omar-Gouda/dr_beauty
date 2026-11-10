import Footer from "@/components/layout/Footer";
import SessionAwareNavbar from "@/components/layout/SessionAwareNavbar";
import { StoreAnnouncement } from "@/components/layout/StoreLayout";

export default function AccountLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <StoreAnnouncement />
      <SessionAwareNavbar mobileOnly />
      <div className="flex-1">{children}</div>
      <Footer mobileOnly />
    </div>
  );
}
