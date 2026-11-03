"use client";

import { MessageCircle } from "lucide-react";
import { buildWhatsAppClickToChatUrl, getWhatsAppSupportDestination, normalizeWhatsAppPhoneNumber } from "@/lib/whatsapp/messages.mjs";

export default function WhatsAppAction({
  templateId,
  variables = {},
  destination,
  preparedUrl,
  children = "Continue in WhatsApp",
  className = "",
  unavailableMessage = "WhatsApp contact is not configured yet.",
  onClick,
}) {
  const phone = typeof destination === "undefined"
    ? getWhatsAppSupportDestination()
    : normalizeWhatsAppPhoneNumber(destination);
  let href = null;
  if (preparedUrl) {
    try {
      const url = new URL(preparedUrl);
      if (url.protocol === "https:" && url.hostname === "wa.me" &&
          /^\/[1-9]\d{7,14}$/.test(url.pathname) && [...url.searchParams.keys()].join(",") === "text" &&
          !url.username && !url.password && !url.hash) href = url.toString();
    } catch {
      // Do not render malformed prepared links.
    }
  } else {
    try {
      if (phone) href = buildWhatsAppClickToChatUrl(phone, templateId, variables);
    } catch {
      // Do not render malformed links when configuration or context is invalid.
    }
  }

  if (!href) return <p role="status" className={`text-xs text-[var(--color-text-secondary)] ${className}`}>{unavailableMessage}</p>;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      title="Opens a prepared WhatsApp draft. Review and send the message in WhatsApp."
      aria-label={typeof children === "string" ? `${children}. Opens a prepared WhatsApp draft; send it manually in WhatsApp.` : undefined}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-primary)] transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${className}`}
    >
      <MessageCircle aria-hidden="true" className="h-4 w-4" />
      {children}
      <span className="sr-only">Opens WhatsApp with a draft. The message is not sent until you send it.</span>
    </a>
  );
}
