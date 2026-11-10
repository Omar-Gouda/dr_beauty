import { Suspense } from "react";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminPageLoading from "@/components/admin/AdminPageLoading";
import { getAdminDashboardData } from "@/lib/admin";

async function AdminDashboardContent({ searchParams }) {
  const query = await searchParams;
  const dashboard = await getAdminDashboardData(query);
  return <AdminDashboard dashboard={dashboard} query={query} />;
}

export default function AdminDashboardPage({ searchParams }) {
  return <Suspense fallback={<AdminPageLoading variant="dashboard" />}><AdminDashboardContent searchParams={searchParams} /></Suspense>;
}
