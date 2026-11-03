"use client";

import { useState, useRef, useEffect, useId } from "react";
import { ChevronDown } from "lucide-react";

export default function CustomSelect({
  options = [],
  value = "",
  onChange,
  placeholder = "Select an option",
  disabled = false,
  loading = false,
  error = "",
  emptyMessage = "No options are available.",
  ariaLabel,
  id,
  className = "",
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const generatedId = useId();
  const listboxId = `${id ?? generatedId}-listbox`;

  const selectedOption = options.find((option) => option.value === value);

  function focusOption(index) {
    const boundedIndex = Math.max(0, Math.min(options.length - 1, index));
    optionRefs.current[boundedIndex]?.focus();
  }

  function handleKeyDown(event) {
    if (disabled || loading) return;
    if (options.length === 0) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) event.preventDefault();
      return;
    }

    if (!isOpen && ["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      setIsOpen(true);
      requestAnimationFrame(() => {
        const selectedIndex = options.findIndex((option) => option.value === value);
        focusOption(event.key === "ArrowUp" ? options.length - 1 : Math.max(selectedIndex, 0));
      });
      return;
    }

    if (!isOpen) return;
    const currentIndex = optionRefs.current.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(currentIndex < 0 ? 0 : (currentIndex + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(currentIndex < 0 ? options.length - 1 : (currentIndex - 1 + options.length) % options.length);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === "Tab") {
      setIsOpen(false);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const option = options[currentIndex];
      if (option) {
        onChange?.(option.value);
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("pointerdown", handleClickOutside);
    return () => document.removeEventListener("pointerdown", handleClickOutside);
  }, []);

  return (
    <div className={`relative w-full ${className}`.trim()} ref={dropdownRef} onKeyDown={handleKeyDown}>
      <button
        id={id}
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel || placeholder}
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-haspopup="listbox"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${listboxId}-error` : undefined}
        disabled={disabled || loading}
        onClick={() => setIsOpen((open) => !open)}
        className="flex min-h-12 w-full items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left text-sm font-medium text-[var(--color-text)] shadow-sm outline-none transition hover:border-[var(--color-rose)] focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span className={selectedOption ? "" : "text-[var(--color-text-secondary)]"}>
          {loading ? "Loading options…" : selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div id={listboxId} role="listbox" aria-labelledby={id} className="absolute left-0 top-full z-50 mt-2 max-h-64 w-full overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1 shadow-xl">
          {error ? <p id={`${listboxId}-error`} role="alert" className="p-3 text-sm text-red-700">{error}</p> : loading ? <p role="status" className="p-3 text-sm text-[var(--color-text-secondary)]">Loading options…</p> : options.length === 0 ? <p role="status" className="p-3 text-sm text-[var(--color-text-secondary)]">{emptyMessage}</p> : options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange?.(option.value);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              className={`w-full rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] ${
                option.value === value
                  ? "bg-[var(--color-primary)] text-white"
                  : "text-[var(--color-text)] hover:bg-[var(--color-background)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {error && !isOpen && <p id={`${listboxId}-error`} role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
    </div>
  );
}
