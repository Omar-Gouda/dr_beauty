export const TURNSTILE_TOKEN_ERROR = "Complete the security check before continuing.";
const MAX_TURNSTILE_TOKEN_LENGTH = 4096;

export function getTurnstileToken(formData) {
  const value = formData?.get("captchaToken");
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (token.length === 0 || token.length > MAX_TURNSTILE_TOKEN_LENGTH) return null;
  return token;
}
