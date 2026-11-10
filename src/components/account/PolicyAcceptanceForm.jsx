"use client";

import Link from "next/link";
import { useActionState } from "react";
import Button from "@/components/ui/Button";
import { acceptCurrentPolicies } from "@/app/(account)/actions";

export default function PolicyAcceptanceForm({ next }) {
  const [state, formAction, pending] = useActionState(acceptCurrentPolicies, null);
  return <form action={formAction} className="mt-6 space-y-5" aria-busy={pending}>
    <input type="hidden" name="next" value={next} />
    {state?.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{state.error}</p>}
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
      <input id="policy-consent" name="policyConsent" type="checkbox" value="accepted" required aria-describedby="policy-consent-help" className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-rose)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]" />
      <label id="policy-consent-help" htmlFor="policy-consent" className="text-sm leading-6 text-[var(--color-text)]">
        I have read and agree to the <Link href="/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-rose)] underline underline-offset-2">Terms &amp; Conditions</Link> and <Link href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="font-semibold text-[var(--color-rose)] underline underline-offset-2">Privacy Policy</Link>.
      </label>
    </div>
    <Button type="submit" disabled={pending} className="w-full">{pending ? "Saving acceptance…" : "Accept and continue"}</Button>
  </form>;
}
