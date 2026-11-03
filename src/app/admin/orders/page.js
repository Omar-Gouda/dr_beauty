import { Suspense } from "react";
import AdminOrdersManager from "@/components/admin/AdminOrdersManager";
import { getAdminOrders } from "@/lib/admin";
import AdminPageLoading from "@/components/admin/AdminPageLoading";

async function AdminOrdersContent({ searchParams }) {
  const result = await getAdminOrders(await searchParams);
  if (result.error) return <p role="alert" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-text-secondary)]">{result.error}</p>;
  const managerKey = [result.filters.search, result.filters.status, result.pagination.pageSize].join("|");
  return <AdminOrdersManager key={managerKey} orders={result.data} filters={result.filters} pagination={result.pagination} historyUnavailable={result.historyUnavailable} />;
}

export default function AdminOrdersPage({ searchParams }) {
  return <Suspense fallback={<AdminPageLoading />}><AdminOrdersContent searchParams={searchParams} /></Suspense>;
}
