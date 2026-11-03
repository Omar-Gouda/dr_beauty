const CHANNEL_PATH_PATTERN = /^\/channel\/[A-Za-z0-9]+\/?$/;

export function validateWhatsAppChannelUrl(value) {
  if (typeof value !== "string" || value.trim() === "") return null;

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:"
      || url.hostname !== "whatsapp.com"
      || url.username
      || url.password
      || url.port
      || url.search
      || url.hash
      || !CHANNEL_PATH_PATTERN.test(url.pathname)
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export function getWhatsAppChannelUrl() {
  return validateWhatsAppChannelUrl(process.env.NEXT_PUBLIC_WHATSAPP_CHANNEL_URL);
}
