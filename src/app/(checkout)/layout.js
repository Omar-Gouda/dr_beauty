import SessionAwareNavbar from "@/components/layout/SessionAwareNavbar";
import Footer from "@/components/layout/Footer";

export default function CheckoutLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] text-[var(--color-text)]">
      <SessionAwareNavbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
