export function getProductImageStateClass(inStock) {
  return inStock === false ? "grayscale" : "";
}

export function normalizeProductImagePositions(positions, imageCount) {
  if (!Number.isSafeInteger(imageCount) || imageCount < 0) return [];
  return Array.from({ length: imageCount }, (_, index) => {
    const position = Array.isArray(positions) ? positions[index] : null;
    if (typeof position !== "string") return "50% 50%";
    const match = position.match(/^\s*(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%\s*$/);
    if (!match) return "50% 50%";
    const x = Number(match[1]);
    const y = Number(match[2]);
    return Number.isFinite(x) && x <= 100 && Number.isFinite(y) && y <= 100
      ? `${x}% ${y}%`
      : "50% 50%";
  });
}
