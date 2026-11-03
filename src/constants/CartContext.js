"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { getProductAvailability } from "@/app/(store)/products/actions";
import { getProductPricing } from "@/lib/products/pricing.mjs";

const CartContext = createContext(null);
const CART_STORAGE_KEY = "dr_beauty_cart";
const CART_CHANGE_EVENT = "dr-beauty-cart-change";
const PRODUCT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_QUANTITY = 999;

function getCartSnapshot() {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribeToCart(callback) {
  const handleStorage = (event) => {
    if (event.key === CART_STORAGE_KEY || event.key === null) callback();
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(CART_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(CART_CHANGE_EVENT, callback);
  };
}

function normalizeProduct(product) {
  if (!product || !PRODUCT_ID_PATTERN.test(product.id ?? "")) return null;
  const price = Number(product.price);
  if (!Number.isFinite(price) || price < 0 || typeof product.name !== "string") return null;
  const pricing = getProductPricing(price, product.compareAtPrice);

  return {
    id: product.id,
    slug: typeof product.slug === "string" ? product.slug : "",
    name: product.name,
    price: pricing.price,
    compareAtPrice: pricing.compareAtPrice,
    currency: "EGP",
    brand: typeof product.brand === "string" ? product.brand : "",
    categoryName: typeof product.categoryName === "string" ? product.categoryName : "",
    images: Array.isArray(product.images)
      ? product.images.filter((image) => typeof image === "string").slice(0, 10)
      : [],
  };
}

function parseCartSnapshot(snapshot) {
  if (!snapshot) return [];
  try {
    const items = JSON.parse(snapshot);
    if (!Array.isArray(items)) return [];
    const unique = new Map();
    items.forEach((item) => {
      const product = normalizeProduct(item);
      const quantity = Number(item?.quantity);
      if (!product || !Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) return;
      const existing = unique.get(product.id);
      unique.set(product.id, {
        ...product,
        revision: typeof item?.revision === "string" ? item.revision : (existing?.revision ?? ""),
        quantity: Math.min(MAX_QUANTITY, (existing?.quantity ?? 0) + quantity),
      });
    });
    return [...unique.values()];
  } catch {
    return [];
  }
}

function saveCart(items) {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(CART_CHANGE_EVENT));
    return true;
  } catch {
    return false;
  }
}

export function CartProvider({ children }) {
  const cartSnapshot = useSyncExternalStore(
    subscribeToCart,
    getCartSnapshot,
    () => null
  );
  const cartItems = parseCartSnapshot(cartSnapshot);
  const [availabilityById, setAvailabilityById] = useState({});
  const [checkedAvailabilitySignature, setCheckedAvailabilitySignature] = useState("");
  const [isCartOpen, setIsCartOpen] = useState(false);
  const productIds = cartItems.map((item) => item.id).sort();
  const availabilitySignature = productIds.join("|");
  const availabilityReady = productIds.length === 0 || checkedAvailabilitySignature === availabilitySignature;
  const cartAvailable = productIds.length > 0 && availabilityReady &&
    productIds.every((id) => availabilityById[id] === "available");

  useEffect(() => {
    if (!availabilitySignature) return undefined;
    if (checkedAvailabilitySignature === availabilitySignature) return undefined;

    let cancelled = false;
    const currentProductIds = availabilitySignature.split("|");
    async function checkStoredItems() {
      let result;
      try {
        result = await getProductAvailability(currentProductIds);
      } catch {
        result = { verified: false, availability: {} };
      }
      if (cancelled) return;

      const statuses = Object.fromEntries(currentProductIds.map((id) => [
        id,
        result?.verified === true
          ? result.availability?.[id] === true ? "available" : "unavailable"
          : "unverified",
      ]));
      setAvailabilityById((previous) => ({ ...previous, ...statuses }));
      setCheckedAvailabilitySignature(availabilitySignature);
    }

    checkStoredItems();
    return () => { cancelled = true; };
  }, [availabilitySignature, checkedAvailabilitySignature]);

  const verifyCartAvailability = async () => {
    const currentItems = parseCartSnapshot(getCartSnapshot());
    const currentIds = currentItems.map((item) => item.id).sort();
    if (currentIds.length === 0) return { ok: false, reason: "empty" };
    const signature = currentIds.join("|");

    let result;
    try {
      result = await getProductAvailability(currentIds);
    } catch {
      result = { verified: false, availability: {} };
    }

    const statuses = Object.fromEntries(currentIds.map((id) => [
      id,
      result?.verified === true
        ? result.availability?.[id] === true ? "available" : "unavailable"
        : "unverified",
    ]));
    const latestIds = parseCartSnapshot(getCartSnapshot()).map((item) => item.id).sort();
    if (latestIds.join("|") !== signature) return { ok: false, reason: "cart_changed" };

    setAvailabilityById((previous) => ({ ...previous, ...statuses }));
    setCheckedAvailabilitySignature(signature);
    if (Object.values(statuses).every((status) => status === "available")) return { ok: true };
    return {
      ok: false,
      reason: Object.values(statuses).some((status) => status === "unverified") ? "unverified" : "unavailable",
    };
  };

  const addToCart = (product, quantity = 1) => {
    const normalizedProduct = normalizeProduct(product);
    if (!normalizedProduct || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
      return false;
    }

    const updated = parseCartSnapshot(getCartSnapshot());
    const existingItem = updated.find((item) => item.id === normalizedProduct.id);
    if (existingItem) {
      if (existingItem.quantity + quantity > MAX_QUANTITY) return false;
      Object.assign(existingItem, normalizedProduct, {
        quantity: existingItem.quantity + quantity,
        revision: window.crypto.randomUUID(),
      });
    } else {
      updated.push({ ...normalizedProduct, quantity, revision: window.crypto.randomUUID() });
    }

    const saved = saveCart(updated);
    if (saved) setIsCartOpen(true);
    return saved;
  };

  const removeFromCart = (productId) => {
    saveCart(parseCartSnapshot(getCartSnapshot()).filter((item) => item.id !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    if (!Number.isInteger(quantity)) return;
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    if (quantity > MAX_QUANTITY) return;
    const updated = parseCartSnapshot(getCartSnapshot()).map((item) =>
      item.id === productId ? { ...item, quantity, revision: window.crypto.randomUUID() } : item
    );
    saveCart(updated);
  };

  const clearItemsIfUnchanged = (expectedItems) => {
    if (!Array.isArray(expectedItems) || expectedItems.length === 0) return false;
    const expected = new Map(
      expectedItems
        .filter((item) => PRODUCT_ID_PATTERN.test(item?.id ?? "") && Number.isInteger(item?.quantity) && typeof item?.revision === "string")
        .map((item) => [item.id, { quantity: item.quantity, revision: item.revision }])
    );
    if (expected.size === 0) return false;

    const current = parseCartSnapshot(getCartSnapshot());
    const remaining = current.filter((item) => {
      const expectedItem = expected.get(item.id);
      return !expectedItem || expectedItem.quantity !== item.quantity || expectedItem.revision !== item.revision;
    });
    if (remaining.length === current.length) return true;
    return saveCart(remaining);
  };

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <CartContext.Provider value={{
      cartItems,
      availabilityById,
      availabilityReady,
      cartAvailable,
      verifyCartAvailability,
      isCartOpen,
      setIsCartOpen,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearItemsIfUnchanged,
      subtotal,
      totalItems,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
