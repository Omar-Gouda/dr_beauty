"use client";

import { useId } from "react";
import AccessibleDialog from "@/components/ui/AccessibleDialog";
import Button from "@/components/ui/Button";

export default function ConfirmationDialog({
  title,
  description,
  confirmLabel = "Confirm",
  pendingLabel = "Working…",
  cancelLabel = "Cancel",
  confirmVariant = "outline",
  isPending = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const close = () => {
    if (!isPending) onCancel?.();
  };

  return (
    <AccessibleDialog onClose={close} labelledBy={titleId} describedBy={descriptionId}>
      <section className="mx-auto my-[max(12px,4dvh)] w-[calc(100%-24px)] max-w-md space-y-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl sm:p-7">
        <div>
          <h2 id={titleId} className="font-editorial text-xl font-bold text-[var(--color-text)]">{title}</h2>
          <p id={descriptionId} className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
        </div>
        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row sm:gap-3">
          <Button type="button" variant="secondary" disabled={isPending} onClick={close}>{cancelLabel}</Button>
          <Button type="button" variant={confirmVariant} disabled={isPending} onClick={onConfirm}>
            {isPending ? pendingLabel : confirmLabel}
          </Button>
        </div>
      </section>
    </AccessibleDialog>
  );
}
