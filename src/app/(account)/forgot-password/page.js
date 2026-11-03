import AuthForm from "@/components/account/AuthForm";
import AuthPageShell from "@/components/account/AuthPageShell";

export default function ForgotPasswordPage() {
  return (
    <AuthPageShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your email and we’ll send reset instructions if an account matches."
    >
        <AuthForm mode="forgot" />
    </AuthPageShell>
  );
}
