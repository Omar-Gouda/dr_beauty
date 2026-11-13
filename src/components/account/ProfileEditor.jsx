"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfile } from "@/app/(account)/actions";
import Button from "@/components/ui/Button";
import ChangePasswordForm from "@/components/account/ChangePasswordForm";

const inputClassName = "min-h-12 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)] transition focus:border-[var(--color-rose)] focus:outline-none focus:ring-2 focus:ring-[var(--color-rose)]/20";

export default function ProfileEditor({ defaults, email, notice = "" }) {
  const router = useRouter();
  const [saved, setSaved] = useState(defaults);
  const [draft, setDraft] = useState(defaults);
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const [message, setMessage] = useState(notice ? { ok: true, text: notice } : null);

  function beginEditing() {
    setDraft(saved);
    setMessage(null);
    setEditing(true);
  }

  function cancelEditing() {
    setDraft(saved);
    setMessage(null);
    setEditing(false);
  }

  function submit(event) {
    event.preventDefault();
    if (submittingRef.current) return;
    const fullName = draft.fullName.trim();
    const phone = draft.phone.trim();
    if (!fullName || fullName.length > 160 || phone.length > 40) {
      setMessage({ ok: false, text: "Enter a name using up to 160 characters and a phone number using up to 40 characters." });
      return;
    }

    const formData = new FormData();
    formData.set("fullName", fullName);
    formData.set("phone", phone);
    formData.set("showPublicRanking", String(draft.showPublicRanking === true));
    submittingRef.current = true;
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await updateProfile(null, formData);
        if (result?.error) {
          setMessage({ ok: false, text: result.error });
          return;
        }
        const updated = { fullName, phone, showPublicRanking: draft.showPublicRanking === true };
        setSaved(updated);
        setDraft(updated);
        setEditing(false);
        setMessage({ ok: true, text: result?.success ?? "Your profile has been updated." });
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "We could not save your profile. Please try again." });
      } finally {
        submittingRef.current = false;
      }
    });
  }

  return (
    <div aria-busy={pending}>
      {message && <p role={message.ok ? "status" : "alert"} className={`mb-5 rounded-xl border px-4 py-3 text-sm ${message.ok ? "border-[var(--color-border)] bg-[var(--color-primary-light)] text-[var(--color-text)]" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</p>}
      {!editing ? (
        <div>
          <dl className="grid gap-5 sm:grid-cols-2">
            <div><dt className="text-xs font-semibold text-[var(--color-text-secondary)]">Full name</dt><dd className="mt-1 break-words text-sm text-[var(--color-text)]">{saved.fullName || "Not provided"}</dd></div>
            <div><dt className="text-xs font-semibold text-[var(--color-text-secondary)]">Primary phone</dt><dd className="mt-1 break-words text-sm text-[var(--color-text)]">{saved.phone || "Not provided"}</dd></div>
            <div><dt className="text-xs font-semibold text-[var(--color-text-secondary)]">Customer rankings</dt><dd className="mt-1 text-sm text-[var(--color-text)]">{saved.showPublicRanking === false ? "Name hidden" : "Name may be shown"}</dd></div>
            <div className="sm:col-span-2"><dt className="text-xs font-semibold text-[var(--color-text-secondary)]">Email</dt><dd className="mt-1 break-all text-sm text-[var(--color-text)]">{email}</dd><p className="mt-1 text-xs text-[var(--color-text-secondary)]">Email is managed by your sign-in account and cannot be changed here.</p></div>
          </dl>
          <Button type="button" className="mt-6" onClick={beginEditing}>Edit Profile</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <label htmlFor="profile-full-name" className="text-sm font-medium text-[var(--color-text)]">Full name</label>
              <input id="profile-full-name" name="fullName" autoComplete="name" maxLength={160} required value={draft.fullName} onChange={(event) => { setMessage(null); setDraft((current) => ({ ...current, fullName: event.target.value })); }} className={inputClassName} />
              <p className="text-xs text-[var(--color-text-secondary)]">Your account stores one full name field, so the saved name is kept together.</p>
            </div>
            <div className="grid content-start gap-2">
              <label htmlFor="profile-phone" className="text-sm font-medium text-[var(--color-text)]">Primary phone number</label>
              <input id="profile-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} value={draft.phone} onChange={(event) => { setMessage(null); setDraft((current) => ({ ...current, phone: event.target.value })); }} className={inputClassName} />
            </div>
            <div className="grid gap-2 sm:col-span-2">
              <label htmlFor="profile-email" className="text-sm font-medium text-[var(--color-text)]">Email</label>
              <input id="profile-email" type="email" value={email} readOnly aria-describedby="profile-email-help" className={`${inputClassName} cursor-not-allowed opacity-75`} />
              <p id="profile-email-help" className="text-xs text-[var(--color-text-secondary)]">Email is managed by Supabase Auth and cannot be changed here.</p>
            </div>
            <label htmlFor="profile-public-ranking" className="flex items-start gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:col-span-2">
              <input
                id="profile-public-ranking"
                type="checkbox"
                checked={draft.showPublicRanking === true}
                onChange={(event) => { setMessage(null); setDraft((current) => ({ ...current, showPublicRanking: event.target.checked })); }}
                className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
              />
                <span><span className="block text-sm font-semibold text-[var(--color-text)]">I agree to show my name in customer rankings</span><span className="mt-1 block text-xs leading-relaxed text-[var(--color-text-secondary)]">This optional choice is off until you turn it on. If enabled, only your profile name may appear; order and account details remain private. You can withdraw this choice at any time.</span></span>
            </label>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save changes"}</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={cancelEditing}>Cancel</Button>
          </div>
        </form>
      )}
      <ChangePasswordForm />
    </div>
  );
}
