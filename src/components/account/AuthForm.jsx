"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useActionState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Button from "@/components/ui/Button";
import TurnstileChallenge from "@/components/account/TurnstileChallenge";
import {
  login,
  register,
  requestPasswordReset,
  updatePassword,
  updateProfile,
} from "@/app/(account)/actions";

const actions = {
  login,
  register,
  forgot: requestPasswordReset,
  reset: updatePassword,
  profile: updateProfile,
};

const inputClassName = [
  "min-h-12 w-full rounded-xl border border-[var(--color-border)]",
  "bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)]",
  "placeholder:text-[var(--color-text-secondary)]/70",
  "transition focus:border-[var(--color-rose)] focus:outline-none focus:ring-2 focus:ring-[var(--color-rose)]/20",
].join(" ");

function Field({ id, name = id, label, type = "text", autoComplete, required = true, defaultValue, inputMode, placeholder, helperText, maxLength, authStyle = true }) {
  return (
    <div className={authStyle ? "auth-field" : "grid gap-2"}>
      <label htmlFor={id} className={authStyle ? "auth-label" : "text-sm font-medium text-[var(--color-text)]"}>{label}</label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        inputMode={inputMode}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-describedby={helperText ? `${id}-help` : undefined}
        className={authStyle ? "auth-input" : inputClassName}
      />
      {helperText && <span id={`${id}-help`} className="text-xs leading-relaxed text-[var(--color-text-secondary)]">{helperText}</span>}
    </div>
  );
}

export function PasswordField({ id = "password", name = id, label, autoComplete, showForgotLink = false }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <div className="auth-label-row">
        <label htmlFor={id} className="auth-label">{label}</label>
        {showForgotLink && <Link href="/forgot-password" className="auth-inline-link">Forgot password?</Link>}
      </div>
      <div className="auth-password-wrap">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          className="auth-input auth-password-input"
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
          className="auth-password-toggle"
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}

export default function AuthForm({ mode, next = "/profile", defaults = {}, notice = "" }) {
  const [state, formAction, pending] = useActionState(actions[mode], null);
  const requiresCaptcha = mode === "login" || mode === "register" || mode === "forgot";
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaAttempted, setCaptchaAttempted] = useState(false);
  const captchaRef = useRef(null);
  const wasPending = useRef(false);
  const authStyle = mode !== "profile";
  const submitLabel = {
    login: "Log in",
    register: "Create account",
    forgot: "Send reset link",
    reset: "Update password",
    profile: "Save changes",
  }[mode];

  useEffect(() => {
    if (pending) {
      wasPending.current = true;
      return;
    }
    if (wasPending.current) {
      wasPending.current = false;
      captchaRef.current?.reset();
      setCaptchaToken("");
      setCaptchaAttempted(false);
    }
  }, [pending]);

  function handleSubmit(event) {
    if (requiresCaptcha && !captchaToken) {
      event.preventDefault();
      setCaptchaAttempted(true);
    }
  }

  function handleCaptchaTokenChange(token) {
    setCaptchaToken(token);
    if (token) setCaptchaAttempted(false);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className={authStyle ? "auth-form" : "grid gap-5"} aria-busy={pending}>
      {mode === "login" && <input type="hidden" name="next" value={next} />}
      {notice && <p role="status" className={authStyle ? "auth-message" : "rounded-xl bg-[var(--color-primary-light)] px-4 py-3 text-sm text-[var(--color-text)]"}>{notice}</p>}
      {state?.error && <p role="alert" className={authStyle ? "auth-message auth-message-error" : "rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"}>{state.error}</p>}
      {state?.success && <p role="status" className={authStyle ? "auth-message" : "rounded-xl bg-[var(--color-primary-light)] px-4 py-3 text-sm text-[var(--color-text)]"}>{state.success}</p>}

      {mode === "register" && (
        <>
          <div className="auth-name-fields">
            <Field id="firstName" label="First name" autoComplete="given-name" />
            <Field id="lastName" label="Last name" autoComplete="family-name" />
          </div>
          <Field
            id="phone"
            label="Primary phone number"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder="010 1234 5678 or +20 10 1234 5678"
            helperText="Use an Egyptian number beginning with 0 or include the international +country code."
            maxLength={40}
          />
        </>
      )}
      {mode === "profile" && (
        <>
          <Field id="fullName" label="Full name" autoComplete="name" defaultValue={defaults.fullName ?? ""} authStyle={false} />
          <Field id="phone" label="Phone number" type="tel" autoComplete="tel" required={false} defaultValue={defaults.phone ?? ""} authStyle={false} />
        </>
      )}
      {(mode === "login" || mode === "register" || mode === "forgot") && (
        <Field id="email" label="Email address" type="email" autoComplete="email" inputMode="email" />
      )}
      {(mode === "login" || mode === "register" || mode === "reset") && (
        <PasswordField
          id="password"
          label={mode === "login" ? "Password" : mode === "reset" ? "New password" : "Create password"}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          showForgotLink={mode === "login"}
        />
      )}
      {(mode === "register" || mode === "reset") && (
        <PasswordField id="passwordConfirmation" label="Confirm password" autoComplete="new-password" />
      )}

      {mode === "register" && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
          <input id="policy-consent" name="policyConsent" type="checkbox" value="accepted" required aria-describedby="policy-consent-help" className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-rose)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" />
          <label id="policy-consent-help" htmlFor="policy-consent" className="text-xs leading-5 text-[var(--color-text)]">
            I have read and agree to the <Link href="/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-rose)] underline underline-offset-2">Terms &amp; Conditions</Link> and <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-rose)] underline underline-offset-2">Privacy Policy</Link>.
          </label>
        </div>
      )}

      {requiresCaptcha && (
        <>
          <input type="hidden" name="captchaToken" value={captchaToken} readOnly />
          <TurnstileChallenge ref={captchaRef} onTokenChange={handleCaptchaTokenChange} />
          {captchaAttempted && !captchaToken && (
            <p role="alert" className="auth-captcha-status auth-captcha-status-error">Complete the security check before continuing.</p>
          )}
        </>
      )}

      <Button type="submit" disabled={pending || (requiresCaptcha && !captchaToken)} size="md" className={authStyle ? "auth-submit shadow-md shadow-[var(--color-primary)]/20" : "mt-1 w-full shadow-md shadow-[var(--color-primary)]/20"}>
        {pending ? "Please wait…" : submitLabel}
      </Button>

      {mode === "login" && (
        <p className="auth-form-footer">
          New to Dr. Beauty? <Link href="/register" className="auth-inline-link">Create an account</Link>
        </p>
      )}
      {mode === "register" && (
        <p className="auth-form-footer">
          Already have an account? <Link href="/login" className="auth-inline-link">Sign in</Link>
        </p>
      )}
      {mode === "forgot" && <Link href="/login" className="auth-form-link">Back to sign in</Link>}
      {mode === "reset" && <Link href="/login" className="auth-form-link">Back to sign in</Link>}
    </form>
  );
}
