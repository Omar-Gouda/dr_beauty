"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Edit, Plus, Search } from "lucide-react";
import AddProductForm from "@/components/admin/AddProductForm";
import { setProductActive } from "@/app/admin/actions";
import { useToast } from "@/constants/ToastContext";
import CustomSelect from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import AccessibleDialog from "@/components/ui/AccessibleDialog";
import ProductPrice from "@/components/products/ProductPrice";

export default function AdminProductsManager({ products, categories, initialEditingProduct = null }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isOpen, setIsOpen] = useState(Boolean(initialEditingProduct));
  const [editing, setEditing] = useState(initialEditingProduct);
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesTerm = !term || product.name.toLowerCase().includes(term) || product.brandName.toLowerCase().includes(term) || product.slug.includes(term);
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? product.is_active : !product.is_active);
      return matchesTerm && matchesStatus;
    });
  }, [products, search, statusFilter]);

  const changeActive = (product) => startTransition(async () => {
    const result = await setProductActive(product.id, !product.is_active);
    showToast(result.message, result.ok ? "success" : "error");
  });

  const openEditor = (product = null) => {
    setEditing(product);
    setIsOpen(true);
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-editorial text-2xl font-bold text-[var(--color-text)] sm:text-3xl">Products Management</h2>
          <p className="text-xs text-[var(--color-text-secondary)] sm:text-sm">Manage catalog details, pricing, inventory, and storefront availability.</p>
        </div>
        <Button type="button" onClick={() => openEditor()}>
          <Plus className="h-4 w-4" /> Add New Product
        </Button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-sm sm:grid-cols-[minmax(0,1fr)_14rem]">
        <label className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-1">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" />
          <span className="sr-only">Search products</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search products or brands…" className="min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-text-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]">
          <span>Product status</span>
          <CustomSelect
            id="product-status-filter"
            options={[{ value: "all", label: "All products" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </label>
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm lg:block">
        <div tabIndex={0} role="region" aria-label="Products table; scroll horizontally to view all columns" className="overflow-x-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]">
          <table className="w-full border-collapse text-left">
            <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]/50 text-[11px] font-bold uppercase text-[var(--color-text-secondary)]">
              <th className="p-4">Product</th><th className="p-4">Category / Brand</th><th className="p-4">Price</th><th className="p-4">Stock</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-[var(--color-border)] text-xs">
              {filteredProducts.map((product) => {
                const image = product.images[0]?.image_url || "/images/categories/skin-care.jpg";
                return <tr key={product.id} className="hover:bg-[var(--color-background)]/50">
                  <td className="p-4"><div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white"><Image src={image} alt={product.name} fill unoptimized className="object-cover" /></div>
                    <div><p className="font-editorial text-sm font-bold">{product.name}</p><p className="text-[10px] text-[var(--color-text-secondary)]">{product.slug}</p></div>
                  </div></td>
                  <td className="p-4"><p className="font-semibold">{product.categoryName || "Uncategorized"}</p><p className="text-[var(--color-text-secondary)]">{product.brandName}</p></td>
                  <td className="p-4"><ProductPrice price={product.price} compareAtPrice={product.compareAtPrice} className="font-bold" priceClassName="text-[var(--color-text)]" compareAtClassName="text-[10px] text-[var(--color-text-secondary)]" showSaleBadge /></td>
                  <td className="p-4">{product.stockQuantity}</td>
                  <td className="p-4"><span className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${product.is_active ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}>{product.is_active ? "Active" : "Inactive"}</span></td>
                  <td className="p-4 text-right"><div className="flex justify-end gap-2">
                    <Button type="button" variant="secondary" size="sm" onClick={() => openEditor(product)} aria-label={`Edit ${product.name}`}><Edit className="h-3.5 w-3.5" /><span className="sr-only">Edit</span></Button>
                    <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => changeActive(product)}>{product.is_active ? "Deactivate" : "Activate"}</Button>
                  </div></td>
                </tr>;
              })}
              {filteredProducts.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-[var(--color-text-secondary)]">{products.length ? "No products match your search." : "No catalog products are available."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-3 lg:hidden">
        {filteredProducts.map((product) => {
          const image = product.images[0]?.image_url || "/images/categories/skin-care.jpg";
          return (
            <article key={product.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
              <div className="flex min-w-0 items-start gap-3">
                <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--color-border)] bg-white">
                  <Image src={image} alt={product.name} fill unoptimized className="object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="break-words font-editorial text-base font-bold">{product.name}</h3>
                  <p className="break-all text-[10px] text-[var(--color-text-secondary)]">{product.slug}</p>
                  <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold ${product.is_active ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}>{product.is_active ? "Active" : "Inactive"}</span>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-3 text-xs">
                <div><dt className="text-[var(--color-text-secondary)]">Category / Brand</dt><dd className="mt-1 break-words font-semibold">{product.categoryName || "Uncategorized"} · {product.brandName}</dd></div>
                <div><dt className="text-[var(--color-text-secondary)]">Price / Stock</dt><dd className="mt-1 font-semibold"><ProductPrice price={product.price} compareAtPrice={product.compareAtPrice} className="font-semibold" priceClassName="text-[var(--color-text)]" compareAtClassName="text-[10px] text-[var(--color-text-secondary)]" showSaleBadge /><span className="mt-1 block">{product.stockQuantity} in stock</span></dd></div>
              </dl>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
                <Button type="button" variant="secondary" size="sm" onClick={() => openEditor(product)} aria-label={`Edit ${product.name}`}><Edit aria-hidden="true" className="h-3.5 w-3.5" />Edit</Button>
                <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => changeActive(product)}>{product.is_active ? "Deactivate" : "Activate"}</Button>
              </div>
            </article>
          );
        })}
        {filteredProducts.length === 0 && <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center text-sm text-[var(--color-text-secondary)]">{products.length ? "No products match your search." : "No catalog products are available."}</p>}
      </div>

      {isOpen && <AccessibleDialog onClose={() => setIsOpen(false)} labelledBy="product-editor-title">
        <section className="mx-auto my-[max(12px,4dvh)] max-h-[92dvh] w-[calc(100%-24px)] max-w-3xl overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl sm:my-[4dvh] sm:p-8">
          <div className="mb-6 flex items-center justify-between border-b border-[var(--color-border)] pb-4">
            <h2 id="product-editor-title" className="font-editorial text-xl font-bold">{editing ? "Edit Product" : "Add New Clinical Product"}</h2>
          <Button type="button" variant="ghost" onClick={() => setIsOpen(false)}>Close</Button>
          </div>
          <AddProductForm key={editing?.id ?? "new-product"} categories={categories} product={editing} onClose={() => setIsOpen(false)} />
        </section>
      </AccessibleDialog>}
    </div>
  );
}
