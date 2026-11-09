"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import {
  appendProductIngredient,
  hasDuplicateProductIngredient,
  removeProductIngredient,
} from "@/lib/products/product-form.mjs";

const inputClass = "min-h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-sm font-normal text-[var(--color-text)] outline-none transition focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20";

export default function IngredientListEditor({ values, onChange, disabled = false, error = "" }) {
  const [duplicateRow, setDuplicateRow] = useState(null);

  const updateIngredient = (index, value) => {
    if (hasDuplicateProductIngredient(values, value, index)) {
      setDuplicateRow(index);
      return;
    }
    setDuplicateRow(null);
    onChange(values.map((ingredient, row) => row === index ? value : ingredient));
  };

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-xs font-semibold text-[var(--color-text)]">Key Ingredients</legend>
      <p className="text-[10px] leading-4 text-[var(--color-text-secondary)]">Add one ingredient per row. Empty rows are ignored and duplicate names are not allowed.</p>
      <div className="space-y-2">
        {values.map((ingredient, index) => {
          const rowErrorId = `product-ingredient-${index}-error`;
          const rowError = duplicateRow === index ? "This ingredient is already listed." : "";
          return (
            <div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:gap-3">
              <div className="min-w-0">
                <label htmlFor={`product-ingredient-${index}`} className="sr-only">Ingredient {index + 1}</label>
                <input
                  id={`product-ingredient-${index}`}
                  value={ingredient}
                  maxLength={10000}
                  onChange={(event) => updateIngredient(index, event.target.value)}
                  aria-invalid={Boolean(rowError || error)}
                  aria-describedby={rowError ? rowErrorId : error ? "product-ingredients-error" : undefined}
                  placeholder={`Ingredient ${index + 1}`}
                  className={inputClass}
                />
                {rowError && <span id={rowErrorId} role="status" className="mt-1 block text-xs text-red-700">{rowError}</span>}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDuplicateRow(null);
                  onChange(removeProductIngredient(values, index));
                }}
                aria-label={`Remove ingredient ${index + 1}`}
                className="min-h-11 shrink-0 px-3"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">Remove</span>
              </Button>
            </div>
          );
        })}
      </div>
      {error && <p id="product-ingredients-error" role="alert" className="text-xs text-red-700">{error}</p>}
      <Button type="button" variant="outline" size="sm" onClick={() => {
        setDuplicateRow(null);
        onChange(appendProductIngredient(values));
      }}>
        <Plus aria-hidden="true" className="h-4 w-4" /> Add Ingredient
      </Button>
    </fieldset>
  );
}
