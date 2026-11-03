"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

const WishlistContext = createContext(null);
const WISHLIST_STORAGE_KEY = "dr_beauty_wishlist";
const WISHLIST_CHANGE_EVENT = "dr-beauty-wishlist-change";
const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getWishlistSnapshot() {
  try {
    return window.localStorage.getItem(WISHLIST_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribeToWishlist(callback) {
  const handleStorage = (event) => {
    if (event.key === WISHLIST_STORAGE_KEY || event.key === null) callback();
  };
  window.addEventListener("storage", handleStorage);
  window.addEventListener(WISHLIST_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(WISHLIST_CHANGE_EVENT, callback);
  };
}

function normalizeProduct(product) {
  const price = Number(product?.price);
  if (!PRODUCT_ID_PATTERN.test(product?.id ?? "") || !Number.isFinite(price) || price < 0 || typeof product?.name !== "string") {
    return null;
  }
  return {
    id: product.id,
    slug: typeof product.slug === "string" ? product.slug : "",
    name: product.name,
    price,
    currency: "EGP",
    brand: typeof product.brand === "string" ? product.brand : "",
    categoryName: typeof product.categoryName === "string" ? product.categoryName : "",
    images: Array.isArray(product.images)
      ? product.images.filter((image) => typeof image === "string").slice(0, 10)
      : [],
  };
}

function parseWishlist(snapshot) {
  if (!snapshot) return [];
  try {
    const items = JSON.parse(snapshot);
    if (!Array.isArray(items)) return [];
    const unique = new Map();
    items.forEach((item) => {
      const product = normalizeProduct(item);
      if (product) unique.set(product.id, product);
    });
    return [...unique.values()];
  } catch {
    return [];
  }
}

function saveWishlist(items) {
  try {
    window.localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(WISHLIST_CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function WishlistProvider({ children }) {
  const snapshot = useSyncExternalStore(subscribeToWishlist, getWishlistSnapshot, () => null);
  const wishlistItems = parseWishlist(snapshot);

  const toggleWishlist = (product) => {
    const normalizedProduct = normalizeProduct(product);
    if (!normalizedProduct) return false;
    const current = parseWishlist(getWishlistSnapshot());
    const exists = current.some((item) => item.id === normalizedProduct.id);
    const updated = exists
      ? current.filter((item) => item.id !== normalizedProduct.id)
      : [...current, normalizedProduct];
    return saveWishlist(updated);
  };

  const removeFromWishlist = (productId) => {
    saveWishlist(parseWishlist(getWishlistSnapshot()).filter((item) => item.id !== productId));
  };

  const isWishlisted = (productId) => wishlistItems.some((item) => item.id === productId);

  return (
    <WishlistContext.Provider value={{ wishlistItems, toggleWishlist, removeFromWishlist, isWishlisted }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error("useWishlist must be used within WishlistProvider");
  return context;
}
