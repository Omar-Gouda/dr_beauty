import { Suspense } from "react";
import { Inbox } from "lucide-react";
import { getAdminServiceRequests } from "@/lib/admin";
import AdminPageLoading from "@/components/admin/AdminPageLoading";
import CustomerRequestReview from "@/components/admin/CustomerRequestReview";

async function CustomerRequestsContent() {
  const result = await getAdminServiceRequests();
  if (result.error) {
    return <section role="alert" className="rounded-3xl border border-amber-200 bg-[var(--color-surface)] p-7 text-sm text-[var(--color-text-secondary)]">{result.error}</section>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-primary)]">Customer care</p>
        <h1 className="font-editorial text-3xl font-bold text-[var(--color-text)]">Customer Requests</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Review consultation and support requests, record internal notes, and track the next manual contact action.</p>
      </header>
      {!result.data.length ? (
        <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
          <Inbox aria-hidden="true" className="mx-auto h-8 w-8 text-[var(--color-primary)]" />
          <h2 className="mt-3 font-editorial text-xl font-bold">No requests yet</h2>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">Submitted customer requests will appear here after the request migration is applied.</p>
        </section>
      ) : (
        <div className="space-y-5">{result.data.map((request) => <CustomerRequestReview key={request.id} request={request} />)}</div>
      )}
    </div>
  );
}

export default function AdminCustomerRequestsPage() {
  return <Suspense fallback={<AdminPageLoading variant="table" />}><CustomerRequestsContent /></Suspense>;
}
