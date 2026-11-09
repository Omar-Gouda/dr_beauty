"use client";

import { useEffect, useRef } from "react";

/** Native modal dialog supplies focus containment, inert background and Escape handling. */
export default function AccessibleDialog({
  children,
  onClose,
  labelledBy,
  describedBy,
  className = "",
}) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return undefined;

    const previousFocus = document.activeElement;
    dialog.showModal();
    dialog.querySelector("[autofocus], input:not([disabled]), button:not([disabled]), a[href], select:not([disabled], [role='combobox']), textarea:not([disabled])")?.focus();

    return () => {
      if (dialog.open) dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`app-dialog fixed inset-0 m-0 h-full w-full max-h-none max-w-none overflow-visible border-0 bg-transparent p-0 text-[var(--color-text)] ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current?.();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) closeRef.current?.();
      }}
    >
      {children}
    </dialog>
  );
}
