export default function ProductStockBadge({ inStock, className = "" }) {
  if (inStock !== false) return null;

  return (
    <span role="status" className={`rounded-full bg-[var(--color-text)] px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm ${className}`.trim()}>
      Out of Stock
    </span>
  );
}
