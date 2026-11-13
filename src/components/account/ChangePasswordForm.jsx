"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { changePassword, requestPasswordReset } from "@/app/(account)/actions";
import AccessibleDialog from "@/components/ui/AccessibleDialog";
import Button from "@/components/ui/Button";
import TurnstileChallenge from "@/components/account/TurnstileChallenge";
import { PasswordField } from "@/components/account/AuthForm";

export default function ChangePasswordForm({ email }) {
  const changeFormRef = useRef(null);
  const recoveryHeadingRef = useRef(null);
  const captchaRef = useRef(null);
  const submittingRef = useRef(false);
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState("change");
  const [message, setMessage] = useState(null);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAttempted, setCaptchaAttempted] = useState(false);

  useEffect(() => {
    if (dialogOpen && view === "recovery") recoveryHeadingRef.current?.focus();
  }, [dialogOpen, view]);

  function closeDialog() {
    if (pending || submittingRef.current) return;
    setDialogOpen(false);
    setView("change");
    setMessage(null);
    setCaptchaToken("");
    setCaptchaAttempted(false);
    changeFormRef.current?.reset();
    captchaRef.current?.reset();
  }

  function runSubmission(submitAction, formData, onResult) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await submitAction(null, formData);
        onResult(result);
      } catch {
        setMessage({ ok: false, text: "We could not complete this request. Please try again." });
        if (submitAction === requestPasswordReset) {
          captchaRef.current?.reset();
          setCaptchaToken("");
          setCaptchaAttempted(false);
        }
      } finally {
        submittingRef.current = false;
      }
    });
  }

  function submitPasswordChange(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    const form = changeFormRef.current;
    if (!form?.reportValidity()) return;
    const formData = new FormData(form);
    runSubmission(changePassword, formData, (result) => {
      if (result?.error) {
        setMessage({ ok: false, text: result.error });
        return;
      }
      form.reset();
      setDialogOpen(false);
      setMessage({ ok: true, text: result?.success ?? "Your password has been updated." });
    });
  }

  function submitRecovery(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    if (!captchaToken) {
      setCaptchaAttempted(true);
      return;
    }
    const formData = new FormData();
    formData.set("email", email ?? "");
    formData.set("captchaToken", captchaToken);
    runSubmission(requestPasswordReset, formData, (result) => {
      if (result?.error) {
        setMessage({ ok: false, text: result.error });
      } else {
        setDialogOpen(false);
        setMessage({ ok: true, text: result?.success ?? "If an account matches that address, a password reset email will arrive shortly." });
      }
      captchaRef.current?.reset();
      setCaptchaToken("");
      setCaptchaAttempted(false);
    });
  }

  return (
    <div>
      {!dialogOpen && message && <p role={message.ok ? "status" : "alert"} className={`mb-5 rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-[var(--color-border)] bg-[var(--color-primary-light)] text-[var(--color-text)]" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-5">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Password</p>
          <p aria-label="Password is set" className="mt-1 select-none tracking-[0.2em] text-[var(--color-text-secondary)]">••••••••••••</p>
        </div>
        <Button type="button" onClick={() => { setMessage(null); setView("change"); setDialogOpen(true); }}>Change Password</Button>
      </div>

      {dialogOpen && (
        <AccessibleDialog
          onClose={closeDialog}
          labelledBy="account-password-dialog-title"
          describedBy="account-password-dialog-description"
        >
          <div className="flex min-h-full items-center justify-center p-4 sm:p-6">
            <section className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-8">
              {view === "change" ? (
                <>
                  <h2 id="account-password-dialog-title" className="font-editorial text-2xl font-semibold text-[var(--color-text)]">Change Password</h2>
                  <p id="account-password-dialog-description" className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">Enter your current password to verify your account, then choose a new one.</p>
                  {message && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{message.text}</p>}
                  <form ref={changeFormRef} onSubmit={submitPasswordChange} className="mt-5 grid gap-4" aria-busy={pending}>
                    <PasswordField id="change-current-password" name="currentPassword" label="Current Password" autoComplete="current-password" />
                    <PasswordField id="change-new-password" name="password" label="New Password" autoComplete="new-password" />
                    <PasswordField id="change-password-confirmation" name="passwordConfirmation" label="Confirm New Password" autoComplete="new-password" />
                    <div className="mt-1 flex flex-wrap justify-end gap-3">
                      <Button type="button" variant="outline" disabled={pending} onClick={closeDialog}>Cancel</Button>
                      <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save Changes"}</Button>
                    </div>
                  </form>
                  <button type="button" disabled={pending} onClick={() => { setMessage(null); setView("recovery"); }} className="mt-5 text-sm font-semibold text-[var(--color-primary)] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] disabled:opacity-50">Forgot your current password?</button>
                </>
              ) : (
                <>
                  <h2 ref={recoveryHeadingRef} tabIndex={-1} id="account-password-dialog-title" className="font-editorial text-2xl font-semibold text-[var(--color-text)]">Forgot your current password?</h2>
                  <p id="account-password-dialog-description" className="mt-2 text-sm leading-relaxed text-[var(--color-text-secondary)]">We can send a password recovery link to your account email. You’ll need access to that inbox to continue.</p>
                  <p className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-4 py-3 text-sm text-[var(--color-text)]">{email || "Your account email"}</p>
                  {message && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{message.text}</p>}
                  <form onSubmit={submitRecovery} className="mt-5 grid gap-4" aria-busy={pending}>
                    <TurnstileChallenge ref={captchaRef} onTokenChange={setCaptchaToken} />
                    {captchaAttempted && !captchaToken && <p role="alert" className="auth-captcha-status auth-captcha-status-error">Complete the security check before continuing.</p>}
                    <div className="flex flex-wrap justify-end gap-3">
                      <Button type="button" variant="outline" disabled={pending} onClick={() => { setMessage(null); setCaptchaToken(""); setView("change"); }}>Back</Button>
                      <Button type="button" variant="ghost" disabled={pending} onClick={closeDialog}>Cancel</Button>
                      <Button type="submit" disabled={pending || !captchaToken}>{pending ? "Sending..." : "Send Recovery Link"}</Button>
                    </div>
                  </form>
                </>
              )}
            </section>
          </div>
        </AccessibleDialog>
      )}
    </div>
  );
}
