import AuthForm from "@/components/account/AuthForm";
import AuthPageShell from "@/components/account/AuthPageShell";

export default function RegisterPage() {
  return (
    <AuthPageShell
      eyebrow="A more personal routine"
      title="Create your account"
      description="Set up your account with a few essential details."
    >
      <AuthForm mode="register" />
    </AuthPageShell>
  );
}
