const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const AUTH_RETURN_PATHS = new Set(["/profile", "/reset-password"]);

export function getSiteUrl({ siteUrl = process.env.NEXT_PUBLIC_SITE_URL, nodeEnv = process.env.NODE_ENV } = {}) {
  const configured = typeof siteUrl === "string" ? siteUrl.trim() : "";
  if (!configured) {
    if (nodeEnv !== "production") return "http://localhost:3000";
    throw new Error("NEXT_PUBLIC_SITE_URL must be configured for production auth links.");
  }

  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an absolute site origin.");
  }

  const isLocalHost = LOCAL_HOSTS.has(parsed.hostname);
  const isDevelopmentLocalhost = nodeEnv !== "production" && isLocalHost;
  const hasCredentials = Boolean(parsed.username || parsed.password);
  const hasExtraUrlParts = parsed.pathname !== "/" || parsed.search || parsed.hash;

  if (
    hasCredentials
    || hasExtraUrlParts
    || (nodeEnv === "production" && isLocalHost)
    || (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isDevelopmentLocalhost))
  ) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an HTTPS site origin (localhost is allowed in development).");
  }

  return parsed.origin;
}

export function getAuthCallbackUrl(returnPath, options) {
  if (!AUTH_RETURN_PATHS.has(returnPath)) {
    throw new Error("Unsupported authentication return path.");
  }

  const callback = new URL("/auth/confirm", getSiteUrl(options));
  callback.searchParams.set("next", returnPath);
  return callback.toString();
}

