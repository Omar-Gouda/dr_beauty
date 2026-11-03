import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import AuthForm from "@/components/account/AuthForm";
import AuthPageShell from "@/components/account/AuthPageShell";
import { getAdminAccess } from "@/lib/admin";

const notices = {
  "signed-out": "You have been logged out.",
  "sign-out-failed": "We couldn't confirm sign-out. Your session may still be active; please try again.",
  welcome: "Your account is ready.",
  "confirmation-failed": "That confirmation link is invalid or has expired. Please try again.",
};

async function LoginFormFromUrl({ searchParams }) {
  await connection();
  const params = await searchParams;
  const requestedNext = typeof params?.next === "string" ? params.next : "";
  const hasValidNext = isSafeNext(requestedNext);
  const access = await getAdminAccess();
  if (access.status === "authorized") redirect(hasValidNext ? requestedNext : "/admin");

  return (
    <AuthForm
      mode="login"
      next={hasValidNext ? requestedNext : ""}
      notice={notices[params?.notice] ?? ""}
    />
  );
}

function isSafeNext(value) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return false;
  try {
    const url = new URL(value, "https://dr-beauty.invalid");
    return url.origin === "https://dr-beauty.invalid" && url.pathname !== "/login";
  } catch {
    return false;
  }
}

export default function LoginPage({ searchParams }) {
  return (
    <AuthPageShell
      eyebrow="Your account"
      title="Welcome back"
      description="Sign in to pick up where you left off and keep your beauty essentials in one place."
    >
      <Suspense fallback={<p role="status" className="auth-message">Preparing sign in…</p>}>
        <LoginFormFromUrl searchParams={searchParams} />
      </Suspense>
    </AuthPageShell>
  );
}
