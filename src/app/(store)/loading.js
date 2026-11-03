import Container from "@/components/ui/Container";
import { BrandLoading, Skeleton } from "@/components/ui/Skeleton";

export default function StoreLoading() {
  return (
    <main className="section" aria-busy="true">
      <Container className="space-y-8">
        <BrandLoading label="Loading your Dr. Beauty experience…" />
        <Skeleton className="h-56 rounded-3xl sm:h-72" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="aspect-[4/5] rounded-2xl" />)}
        </div>
      </Container>
    </main>
  );
}
