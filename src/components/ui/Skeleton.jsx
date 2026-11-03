import Image from "next/image";

export function Skeleton({ className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-xl bg-[var(--color-primary-light)]/70 motion-reduce:animate-none ${className}`}
    />
  );
}

export function BrandLoading({ label = "Loading Dr. Beauty" }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-center gap-3 text-sm text-[var(--color-text-secondary)]">
      <span aria-hidden="true" className="relative flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-primary)] motion-safe:animate-pulse motion-reduce:animate-none">
        <Image src="/icons/svg/logo-SVG/logo-SVG.svg" alt="" width={24} height={24} />
      </span>
      <span>{label}</span>
    </div>
  );
}
