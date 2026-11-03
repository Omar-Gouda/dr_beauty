import assert from "node:assert/strict";
import test from "node:test";
import { getWhatsAppChannelUrl, validateWhatsAppChannelUrl } from "../src/lib/whatsapp/channel.mjs";

test("accepts the official HTTPS WhatsApp Channel URL format", () => {
  const url = "https://whatsapp.com/channel/ExampleChannel123";
  assert.equal(validateWhatsAppChannelUrl(url), url);
});

test("returns no CTA URL when the environment variable is missing", () => {
  const previous = process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL;
  try {
    delete process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL;
    assert.equal(getWhatsAppChannelUrl(), null);
  } finally {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL;
    else process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL = previous;
  }
});

test("rejects invalid and non-HTTPS URLs", () => {
  for (const url of ["not a URL", "http://whatsapp.com/channel/Example123", "javascript:alert(1)"]) {
    assert.equal(validateWhatsAppChannelUrl(url), null, `accepted ${url}`);
  }
});

test("rejects unrelated WhatsApp destinations and URL decorations", () => {
  for (const url of [
    "https://wa.me/201234567890",
    "https://web.whatsapp.com/",
    "https://whatsapp.com/send?phone=201234567890",
    "https://whatsapp.com.evil.example/channel/Example123",
    "https://whatsapp.com/channel/Example123?text=hello",
    "https://user@whatsapp.com/channel/Example123",
  ]) {
    assert.equal(validateWhatsAppChannelUrl(url), null, `accepted ${url}`);
  }
});
