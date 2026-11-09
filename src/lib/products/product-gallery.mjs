import { formatImageObjectPosition } from "./product-form.mjs";

export function buildProductGalleryItems(images = [], imagePositions = []) {
  return images.map((url, index) => ({
    url,
    objectPosition: typeof imagePositions[index] === "string" &&
      /^(?:100|[0-9]{1,2}(?:\.[0-9]+)?)%\s+(?:100|[0-9]{1,2}(?:\.[0-9]+)?)%$/.test(imagePositions[index])
      ? imagePositions[index]
      : formatImageObjectPosition(imagePositions[index]),
  }));
}
