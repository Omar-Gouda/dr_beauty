"use client";

import { useRef, useState, useTransition } from "react";
import { changePassword } from "@/app/(account)/actions";
import Button from "@/components/ui/Button";
import { PasswordField } from "@/components/account/AuthForm";

export default function ChangePasswordForm() {
  const formRef = useRef(null);
  const submittingRef = useRef(false);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState(null);

  function submit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    const form = formRef.current;
    if (!form?.reportValidity()) return;
    submittingRef.current = true;
    setMessage(null);
    const formData = new FormData(form);
    startTransition(async () => {
      try {
        const result = await changePassword(null, formData);
        if (result?.error) {
          setMessage({ ok: false, text: result.error });
          return;
        }
        form.reset();
        setMessage({ ok: true, text: result?.success ?? "Your password has been updated." });
      } catch {
        setMessage({ ok: false, text: "We could not update your password. Please try again." });
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <section className="mt-8 border-t border-[var(--color-border)] pt-6" aria-busy={pending}>
      <h3 className="font-editorial text-xl font-semibold text-[var(--color-text)]">Change password</h3>
      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">Confirm your current password before choosing a new one.</p>
      {message && <p role={message.ok ? "status" : "alert"} className={`mt-4 rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-[var(--color-border)] bg-[var(--color-primary-light)] text-[var(--color-text)]" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</p>}
      <form ref={formRef} onSubmit={submit} className="mt-5 grid max-w-xl gap-4">
        <PasswordField id="change-current-password" name="currentPassword" label="Current password" autoComplete="current-password" />
        <PasswordField id="change-new-password" name="password" label="New password" autoComplete="new-password" />
        <PasswordField id="change-password-confirmation" name="passwordConfirmation" label="Confirm new password" autoComplete="new-password" />
        <Button type="submit" disabled={pending}>{pending ? "Updating..." : "Update password"}</Button>
      </form>
    </section>
  );
}
