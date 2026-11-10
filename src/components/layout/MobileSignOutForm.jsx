"use client";

import { useFormStatus } from "react-dom";
import { LogOut, LoaderCircle } from "lucide-react";
import { logout } from "@/app/(account)/actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending} aria-busy={pending} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[var(--color-rose)] transition-colors hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] disabled:cursor-wait disabled:opacity-70">
    {pending ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <LogOut aria-hidden="true" className="h-4 w-4" />}
    {pending ? "Signing out…" : "Sign Out"}
  </button>;
}

export default function MobileSignOutForm({ onSubmit }) {
  return <form action={logout} onSubmit={onSubmit}>
    <SubmitButton />
  </form>;
}
