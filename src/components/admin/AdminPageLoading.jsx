import { Skeleton } from "@/components/ui/Skeleton";

export default function AdminPageLoading({ variant = "table" }) {
  return (
    <section aria-busy="true" aria-label="Loading admin content" className="space-y-6">
      <p role="status" className="sr-only">Loading admin page…</p>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {variant === "dashboard" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-32 rounded-3xl" />)}
          </div>
          <Skeleton className="h-64 rounded-3xl" />
        </>
      ) : variant === "products" ? (
        <>
          <Skeleton className="h-14 rounded-2xl" />
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)}
        </>
      ) : (
        <Skeleton className="h-72 rounded-3xl" />
      )}
    </section>
  );
}
