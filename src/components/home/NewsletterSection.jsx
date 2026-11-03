import Container from "@/components/ui/Container";
import { MessageCircle } from "lucide-react";
import { getWhatsAppChannelUrl } from "@/lib/whatsapp/channel.mjs";

export default function NewsletterSection() {
  const channelUrl = getWhatsAppChannelUrl();

  if (!channelUrl) {
    console.warn("[whatsapp-channel] Follow CTA omitted: NEXT_PUBLIC_WHATSAPP_CHANNEL_URL is missing or invalid.");
  }

  return (
    <section className="home-section border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <Container size="wide">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="mb-3 font-editorial text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
            Join the Dr. Beauty WhatsApp Channel
          </h2>
          <p className="mx-auto max-w-lg text-sm leading-6 text-[var(--color-text-secondary)]">
            Follow for updates about offers, discounts, and new products. Following takes place on WhatsApp; this website does not collect your phone number through this link.
          </p>
          {channelUrl ? (
            <a
              href={channelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-primary)] px-7 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)] focus-visible:ring-offset-2"
            >
              <MessageCircle aria-hidden="true" size={18} />
              Follow Our WhatsApp Channel
            </a>
          ) : (
            <p role="status" className="mt-6 text-sm text-[var(--color-text-secondary)]">
              The WhatsApp Channel link is temporarily unavailable.
            </p>
          )}
        </div>
      </Container>
    </section>
  );
}
