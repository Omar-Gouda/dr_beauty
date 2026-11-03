import Link from "next/link";
import { connection } from "next/server";
import { getCustomerRequestContext } from "@/lib/customer-requests";
import CustomerRequestForm from "@/components/requests/CustomerRequestForm";

const PAGE_COPY = {
  beauty_tips: {
    eyebrow: "Personalized beauty guidance",
    title: "Beauty Tips with Dr. Radwa",
    description: "Tell us what you are looking for and the team can review your question about skincare, haircare, or choosing a product.",
  },
  support: {
    eyebrow: "Customer care",
    title: "How can we help?",
    description: "Send a support request about an order, delivery, missing item, or another store question. A request does not automatically cancel an order or approve a refund.",
  },
};

export default async function CustomerRequestPage({ requestType }) {
  // Supabase SSR reads the request cookies and auth session. Keep that work in
  // the streamed request-time subtree rather than evaluating it at prerender.
  await connection();
  const context = await getCustomerRequestContext(requestType);
  const copy = PAGE_COPY[requestType];

  if (context.status !== "ready") {
    return (
      <main className="container section">
        <div className="mx-auto max-w-3xl rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm sm:p-9">
          <h1 className="section-heading">{copy.title}</h1>
          <p role="alert" className="section-description">This request form is temporarily unavailable. Please try again later.</p>
          <Link href="/" className="mt-5 inline-block text-sm font-semibold text-[var(--color-primary)] hover:underline">Return to Dr. Beauty</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="container section">
      <div className="mx-auto max-w-3xl">
        <header className="mb-7 sm:mb-9">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">{copy.eyebrow}</p>
          <h1 className="section-heading">{copy.title}</h1>
          <p className="section-description">{copy.description}</p>
        </header>
        <CustomerRequestForm
          requestType={requestType}
          email={context.email}
          phone={context.phone}
          products={context.products}
          orders={context.orders}
        />
        <p className="mt-5 text-center text-xs leading-5 text-[var(--color-text-secondary)]">
          Requests are reviewed by the Dr. Beauty team. Choose WhatsApp as your reply method to open one prepared draft after the request is saved; nothing is sent automatically.
        </p>
      </div>
    </main>
  );
}
