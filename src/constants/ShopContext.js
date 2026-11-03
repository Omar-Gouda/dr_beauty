"use client";

import { createContext, useContext, useMemo, useState } from "react";

const ShopContext = createContext(null);

export function ShopProvider({ children, products = [], categories = [], initialSearchQuery = "" }) {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedRating, setSelectedRating] = useState(null);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [sortBy, setSortBy] = useState("featured");
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);

  const brands = useMemo(
    () => [...new Set(products.map((product) => product.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [products],
  );
  const ratingsAvailable = products.some((product) => product.rating != null);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const filtered = products.filter((product) => {
      if (selectedCategory !== "all" && product.category !== selectedCategory) return false;
      if (selectedRating && (product.rating == null || product.rating < selectedRating)) return false;
      if (selectedBrands.length && !selectedBrands.includes(product.brand)) return false;
      if (query) {
        const searchable = [
          product.name,
          product.brand,
          product.categoryName,
          product.description,
          product.ingredients,
        ].join(" ").toLocaleLowerCase();
        if (!searchable.includes(query)) return false;
      }
      return true;
    });

    return filtered.sort((first, second) => {
      if (sortBy === "price-low") return first.price - second.price;
      if (sortBy === "price-high") return second.price - first.price;
      if (sortBy === "rating") return second.rating - first.rating;
      return Number(second.isBestseller) - Number(first.isBestseller) || first.name.localeCompare(second.name);
    });
  }, [products, selectedCategory, selectedRating, selectedBrands, sortBy, searchQuery]);

  const value = {
    brands,
    categories,
    ratingsAvailable,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedRating,
    setSelectedRating,
    selectedBrands,
    setSelectedBrands,
    sortBy,
    setSortBy,
    filteredProducts,
  };

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  return useContext(ShopContext);
}
