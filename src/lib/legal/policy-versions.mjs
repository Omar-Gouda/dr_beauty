export const CURRENT_TERMS_VERSION = "terms-2026-11-10-r2";
export const CURRENT_PRIVACY_VERSION = "privacy-2026-11-10-r2";

export function isPolicyConsentCurrent(status) {
  return Boolean(status?.needs_acceptance === false);
}

export function safePolicyReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return "/profile";
  }

  try {
    const target = new URL(value, "https://dr-beauty.invalid");
    return target.origin === "https://dr-beauty.invalid" && target.pathname !== "/accept-policies"
      ? `${target.pathname}${target.search}${target.hash}`
      : "/profile";
  } catch {
    return "/profile";
  }
}
