"use client";

import { useRef, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import Button from "@/components/ui/Button";

export default function AdminAnnouncementComposer({ channelUrl }) {
  const [message, setMessage] = useState("");
  const [feedback, setFeedback] = useState("");
  const inputRef = useRef(null);
  const hasMessage = Boolean(message.trim());

  async function copyMessage() {
    if (!hasMessage) return;
    try {
      await navigator.clipboard.writeText(message.trim());
      setFeedback("Announcement copied. Paste it into the channel and publish it manually.");
    } catch {
      inputRef.current?.focus();
      inputRef.current?.select();
      setFeedback("Automatic copy was unavailable. The message is selected so you can copy it manually.");
    }
  }

  return <section aria-labelledby="announcement-composer-title" className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 sm:p-5">
    <h3 id="announcement-composer-title" className="font-editorial text-lg font-semibold text-[var(--color-text)]">Prepare a channel announcement</h3>
    <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)]">Write a standalone message, review the preview, copy it, then open the channel to publish it yourself. Nothing is sent automatically.</p>
    <label className="mt-4 block text-xs font-semibold text-[var(--color-text-secondary)]">Announcement text<textarea ref={inputRef} value={message} onChange={(event) => { setMessage(event.target.value); setFeedback(""); }} maxLength={2000} rows={5} placeholder="Write your announcement…" className="mt-1.5 min-h-32 w-full resize-y rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm leading-6 text-[var(--color-text)] outline-none focus-visible:border-[var(--color-rose)] focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]/20" /></label>
    <p className="mt-1 text-right text-[10px] text-[var(--color-text-secondary)]">{message.length}/2000</p>
    <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4" aria-label="Announcement preview">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-secondary)]">Preview</p>
      <p className="mt-2 min-h-6 whitespace-pre-wrap break-words text-sm leading-6 text-[var(--color-text)]">{message.trim() || "Your announcement preview will appear here."}</p>
    </div>
    <div className="mt-4 flex flex-wrap gap-2">
      <Button type="button" variant="secondary" disabled={!hasMessage} onClick={copyMessage}><Copy aria-hidden="true" className="h-4 w-4" />Copy announcement</Button>
      {channelUrl ? <a href={channelUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-5 text-sm font-semibold text-[var(--color-primary)] hover:border-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-rose)]"><ExternalLink aria-hidden="true" className="h-4 w-4" />Open WhatsApp Channel</a> : <p className="self-center text-xs text-[var(--color-text-secondary)]">The channel link is not configured on this site.</p>}
    </div>
    {feedback && <p role="status" className="mt-3 text-xs text-[var(--color-text-secondary)]">{feedback}</p>}
  </section>;
}
