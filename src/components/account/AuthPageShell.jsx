import Link from "next/link";
import Image from "next/image";

export default function AuthPageShell({ eyebrow, title, description, children }) {
  return (
    <main className="auth-page">
      <div className="auth-shell">
        <Link href="/" className="auth-brand">
          <Image src="/icons/svg/logo-SVG/logo-SVG.svg" alt="" width={32} height={32} className="auth-brand-logo" />
          <span>Dr. Beauty</span>
        </Link>

        <section className="auth-card" aria-labelledby="auth-title">
          <header className="auth-card-header">
            <p className="auth-eyebrow">{eyebrow}</p>
            <h1 id="auth-title" className="auth-title">
              {title}
            </h1>
            <p className="auth-description">{description}</p>
          </header>
          {children}
        </section>

        <Link href="/" className="auth-return-link">
          Return to Dr. Beauty
        </Link>
      </div>
    </main>
  );
}
