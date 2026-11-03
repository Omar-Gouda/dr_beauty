const DIRECT_THREAT_PATTERNS = [
  /\b(?:i|we)\s+(?:will|am going to|are going to|want to)\s+(?:kill|hurt|attack|harm|rape|stab|shoot)\s+(?:you|him|her|them|someone|somebody)\b/i,
  /\b(?:i|we)\s+(?:will|am going to|are going to)\s+(?:burn|destroy)\s+(?:your|their|his|her)\s+(?:home|house|store|business)\b/i,
];

const DIRECT_ABUSE_PATTERNS = [
  /\b(?:you(?:'re| are)|you)\s+(?:(?:a|an)\s+)?(?:worthless|idiot|moron|stupid|bastard|bitch|whore|scammer)\b/i,
  /\b(?:shut up|fuck off|f[u*]ck you)\b/i,
];

export function validateProductReview({ rating, title = "", body = "" } = {}) {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "rating";
  if (typeof title !== "string" || title.length > 160) return "title";
  if (typeof body !== "string" || body.trim().length < 1 || body.length > 5000) return "body";
  const content = `${title}\n${body}`;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) return "malformed";
  if ([...DIRECT_THREAT_PATTERNS, ...DIRECT_ABUSE_PATTERNS].some((pattern) => pattern.test(content))) return "prohibited_content";
  return null;
}
