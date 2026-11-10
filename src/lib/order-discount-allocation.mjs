/** Allocate already-calculated promotion cents proportionally across eligible lines. */
export function allocatePromotionDiscountCents(items, discountCents) {
  if (!Array.isArray(items) || !Number.isSafeInteger(discountCents) || discountCents < 0) return null;
  const seen = new Set();
  const normalized = [];
  for (const item of items) {
    if ((typeof item?.id !== "string" && typeof item?.id !== "number") ||
        !Number.isSafeInteger(item.lineCents) || item.lineCents < 0 || typeof item.eligible !== "boolean") return null;
    const id = String(item.id);
    if (!id || seen.has(id)) return null;
    seen.add(id);
    normalized.push({ id, lineCents: item.lineCents, eligible: item.eligible });
  }
  const eligible = normalized.filter((item) => item.eligible);
  const eligibleTotal = eligible.reduce((total, item) => total + BigInt(item.lineCents), 0n);
  if (BigInt(discountCents) > eligibleTotal || (discountCents > 0 && eligibleTotal === 0n)) return null;

  const allocations = new Map(normalized.map((item) => [item.id, 0]));
  if (discountCents === 0) return normalized.map((item) => ({ id: item.id, discountCents: 0 }));

  const total = BigInt(discountCents);
  let allocated = 0n;
  const portions = eligible.map((item) => {
    const numerator = total * BigInt(item.lineCents);
    const base = numerator / eligibleTotal;
    allocated += base;
    return { ...item, base, remainder: numerator % eligibleTotal };
  });
  const remainderCents = total - allocated;
  portions.sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.id.localeCompare(right.id);
  });
  portions.forEach((item, index) => {
    allocations.set(item.id, Number(item.base + (BigInt(index) < remainderCents ? 1n : 0n)));
  });

  return normalized.map((item) => ({ id: item.id, discountCents: allocations.get(item.id) }));
}
