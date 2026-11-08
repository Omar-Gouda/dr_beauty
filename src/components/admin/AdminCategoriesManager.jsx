"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Edit, Plus, Trash2 } from "lucide-react";
import { deleteCategory, saveCategory, setCategoryActive } from "@/app/admin/actions";
import { useToast } from "@/constants/ToastContext";
import CustomSelect from "@/components/ui/Select";
import Button from "@/components/ui/Button";
import AccessibleDialog from "@/components/ui/AccessibleDialog";
import ExternalImageUrlField from "@/components/admin/ExternalImageUrlField";
import ImageWithFallback from "@/components/ui/ImageWithFallback";
import { categoryImages, fallbackCategoryImage } from "@/data/categoryImages";
import { slugifyCategory } from "@/lib/image-url.mjs";

const inputClass = "mt-1 min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 font-normal text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";
const textareaClass = "mt-1 w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 font-normal text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";
const emptyForm = { id: null, name: "", slug: "", description: "", imageUrl: "", sortOrder: "0", isActive: true };

export default function AdminCategoriesManager({ categories }) {
  const [form, setForm] = useState(emptyForm);
  const [slugEdited, setSlugEdited] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const { showToast } = useToast();
  const router = useRouter();
  const filteredCategories = useMemo(() => {
    const term = search.trim().toLowerCase();
    return categories.filter((category) => {
      const matchesTerm = !term || category.name.toLowerCase().includes(term) || category.slug.toLowerCase().includes(term);
      const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? category.is_active : !category.is_active);
      return matchesTerm && matchesStatus;
    });
  }, [categories, search, statusFilter]);

  const openEditor = (category = null) => {
    setSlugEdited(Boolean(category));
    setForm(category ? {
      id: category.id,
      name: category.name ?? "",
      slug: category.slug ?? "",
      description: category.description ?? "",
      imageUrl: category.image_url ?? "",
      sortOrder: String(category.sort_order ?? 0),
      isActive: category.is_active ?? true,
    } : emptyForm);
    setIsOpen(true);
  };

  const submit = (event) => {
    event.preventDefault();
    if (isPending) return;
    const input = { ...form, sortOrder: form.sortOrder === "" ? "" : Number(form.sortOrder) };
    startTransition(async () => {
      try {
        const result = await saveCategory(input);
        showToast(result.message, result.ok ? "success" : "error");
        if (result.ok) {
          setIsOpen(false);
          router.refresh();
        }
      } catch {
        showToast("Category could not be saved. Please try again.", "error");
      }
    });
  };

  const toggle = (category) => startTransition(async () => {
    try {
      const result = await setCategoryActive(category.id, !category.is_active);
      showToast(result.message, result.ok ? "success" : "error");
      if (result.ok) router.refresh();
    } catch {
      showToast("Category status could not be changed.", "error");
    }
  });

  const remove = (category) => {
    if (isPending || !window.confirm(`Delete “${category.name}”? Categories used by products cannot be deleted.`)) return;
    startTransition(async () => {
      try {
        const result = await deleteCategory(category.id);
        showToast(result.message, result.ok ? "success" : "error");
        if (result.ok) router.refresh();
      } catch {
        showToast("Category could not be deleted. Please try again.", "error");
      }
    });
  };

  const updateName = (name) => setForm((current) => ({
    ...current,
    name,
    ...(!slugEdited ? { slug: slugifyCategory(name) } : {}),
  }));

  const imageFor = (category) => category.image_url || categoryImages[category.slug] || fallbackCategoryImage;
  const fallbackFor = (category) => categoryImages[category.slug] || fallbackCategoryImage;

  return (
    <div className="space-y-8">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div><h2 className="font-editorial text-2xl font-bold sm:text-3xl">Category Management</h2><p className="text-xs text-[var(--color-text-secondary)] sm:text-sm">Manage storefront categories and display order.</p></div>
        <Button type="button" onClick={() => openEditor()}><Plus className="h-4 w-4" /> Add Category</Button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]"><span>Search categories</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or slug" className="min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /></label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--color-text-secondary)]"><span>Category status</span><CustomSelect id="category-status-filter" options={[{ value: "all", label: "All categories" }, { value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} value={statusFilter} onChange={setStatusFilter} /></label>
      </div>

      <div className="hidden overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm lg:block">
        <div tabIndex={0} role="region" aria-label="Categories table; scroll horizontally to view all columns" className="overflow-x-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><table className="w-full border-collapse text-left text-xs">
          <thead><tr className="border-b border-[var(--color-border)] bg-[var(--color-background)]/50 text-[11px] uppercase text-[var(--color-text-secondary)]"><th className="p-4">Image</th><th className="p-4">Category</th><th className="p-4">Slug</th><th className="p-4">Display Order</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th></tr></thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {filteredCategories.map((category) => <tr key={category.id}>
              <td className="p-4"><div className="relative h-14 w-20 overflow-hidden rounded-lg bg-[var(--color-primary-light)]"><ImageWithFallback src={imageFor(category)} fallbackSrc={fallbackFor(category)} alt={`${category.name} category`} sizes="80px" /></div></td>
              <td className="p-4"><p className="font-semibold">{category.name}</p>{category.description && <p className="mt-1 max-w-sm text-[10px] text-[var(--color-text-secondary)]">{category.description}</p>}</td>
              <td className="p-4">{category.slug}</td><td className="p-4">{category.sort_order}</td>
              <td className="p-4"><span className={`rounded-full border px-3 py-1 text-[10px] font-semibold ${category.is_active ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}>{category.is_active ? "Active" : "Inactive"}</span></td>
              <td className="p-4 text-right"><div className="flex justify-end gap-2"><Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => openEditor(category)} aria-label={`Edit ${category.name}`}><Edit className="h-3.5 w-3.5" /><span className="sr-only">Edit</span></Button><Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => toggle(category)}>{category.is_active ? "Deactivate" : "Activate"}</Button><Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => remove(category)} aria-label={`Delete ${category.name}`}><Trash2 className="h-3.5 w-3.5" /><span className="sr-only">Delete</span></Button></div></td>
            </tr>)}
            {filteredCategories.length === 0 && <tr><td colSpan="6" className="p-12 text-center text-[var(--color-text-secondary)]">{categories.length ? "No categories match these filters." : "No categories are available. Create a category to make it selectable for products."}</td></tr>}
          </tbody>
        </table></div>
      </div>

      <div className="space-y-3 lg:hidden">
        {filteredCategories.map((category) => (
          <article key={category.id} className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3"><div className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--color-primary-light)]"><ImageWithFallback src={imageFor(category)} fallbackSrc={fallbackFor(category)} alt={`${category.name} category`} sizes="80px" /></div><div className="min-w-0"><h3 className="break-words font-semibold">{category.name}</h3>{category.description && <p className="mt-1 break-words text-xs text-[var(--color-text-secondary)]">{category.description}</p>}</div></div>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-[10px] font-semibold ${category.is_active ? "border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]" : "border-[var(--color-border)] text-[var(--color-text-secondary)]"}`}>{category.is_active ? "Active" : "Inactive"}</span>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-3 text-xs">
              <div><dt className="text-[var(--color-text-secondary)]">Slug</dt><dd className="mt-1 break-all font-medium">{category.slug}</dd></div>
              <div><dt className="text-[var(--color-text-secondary)]">Display order</dt><dd className="mt-1 font-medium">{category.sort_order}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-3">
              <Button type="button" variant="secondary" size="sm" disabled={isPending} onClick={() => openEditor(category)}>Edit</Button>
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => toggle(category)}>{category.is_active ? "Deactivate" : "Activate"}</Button>
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => remove(category)}><Trash2 className="h-3.5 w-3.5" /> Delete</Button>
            </div>
          </article>
        ))}
        {filteredCategories.length === 0 && <p className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 text-center text-sm text-[var(--color-text-secondary)]">{categories.length ? "No categories match these filters." : "No categories are available. Create a category to make it selectable for products."}</p>}
      </div>

      {isOpen && <AccessibleDialog onClose={() => !isPending && setIsOpen(false)} labelledBy="category-editor-title">
        <form onSubmit={submit} aria-labelledby="category-editor-title" className="mx-auto my-[max(12px,4dvh)] max-h-[92dvh] w-[calc(100%-24px)] max-w-lg space-y-4 overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl sm:p-8">
          <h2 id="category-editor-title" className="font-editorial text-xl font-bold">{form.id ? "Edit Category" : "Add Category"}</h2>
          <label className="block text-xs font-semibold">Name<input name="name" required maxLength={120} value={form.name} onChange={(event) => updateName(event.target.value)} className={inputClass} /></label>
          <label className="block text-xs font-semibold">Slug<input name="slug" maxLength={120} value={form.slug} onChange={(event) => { setSlugEdited(true); setForm((current) => ({ ...current, slug: event.target.value })); }} placeholder="auto-generated from name" className={inputClass} /></label>
          <label className="block text-xs font-semibold">Description<textarea name="description" maxLength={2000} rows={3} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className={textareaClass} /></label>
          <ExternalImageUrlField id="category-image-url" value={form.imageUrl} disabled={isPending} onChange={(imageUrl) => setForm((current) => ({ ...current, imageUrl }))} />
          <label className="block text-xs font-semibold">Display Order<input name="sortOrder" type="number" min="0" max="100000" step="1" required value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} className={inputClass} /></label>
          <label className="flex items-center gap-2 text-xs"><input name="isActive" type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} className="accent-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" /> Active in storefront</label>
          <div className="flex flex-col-reverse justify-end gap-2 pt-3 sm:flex-row sm:gap-3"><Button type="button" variant="secondary" disabled={isPending} onClick={() => setIsOpen(false)}>Cancel</Button><Button type="submit" disabled={isPending}>{isPending ? "Saving…" : "Save Category"}</Button></div>
        </form>
      </AccessibleDialog>}
    </div>
  );
}
