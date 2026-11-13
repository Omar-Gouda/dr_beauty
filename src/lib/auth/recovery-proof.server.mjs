import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const RECOVERY_PROOF_COOKIE = "drbeauty-recovery-proof";
export const RECOVERY_PROOF_TTL_SECONDS = 15 * 60;

export function getRecoveryProofSecret() {
  const secret = process.env.AUTH_RECOVERY_PROOF_SECRET;
  return typeof secret === "string" && Buffer.byteLength(secret, "utf8") >= 32 ? secret : null;
}

function signature(userId, expiresAt, nonce, secret) {
  return createHmac("sha256", secret)
    .update(`dr-beauty:password-recovery:v2:${userId}:${expiresAt}:${nonce}`)
    .digest("base64url");
}

export function createRecoveryProof(userId, secret, now = Date.now()) {
  if (typeof userId !== "string" || !userId || typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) return null;
  const expiresAt = Math.floor(now / 1000) + RECOVERY_PROOF_TTL_SECONDS;
  const nonceBytes = randomBytes(32);
  const nonce = nonceBytes.toString("base64url");
  const value = `${expiresAt}.${nonce}.${signature(userId, expiresAt, nonce, secret)}`;
  const nonceDigest = createHash("sha256").update(nonceBytes).digest("hex");
  return { value, nonceDigest, expiresAt };
}

export function readRecoveryProof(value, userId, secret, now = Date.now()) {
  if (typeof value !== "string" || typeof userId !== "string" || typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) return null;
  const match = /^(\d{10})\.([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]{43})$/.exec(value);
  if (!match) return null;
  const expiresAt = Number(match[1]);
  const nowSeconds = Math.floor(now / 1000);
  if (expiresAt <= nowSeconds || expiresAt > nowSeconds + RECOVERY_PROOF_TTL_SECONDS) return null;
  const nonce = match[2];
  const nonceBytes = Buffer.from(nonce, "base64url");
  if (nonceBytes.length !== 32 || nonceBytes.toString("base64url") !== nonce) return null;
  const expected = Buffer.from(signature(userId, expiresAt, nonce, secret));
  const supplied = Buffer.from(match[3]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  return {
    expiresAt,
    nonceDigest: createHash("sha256").update(nonceBytes).digest("hex"),
  };
}

export function verifyRecoveryProof(value, userId, secret, now = Date.now()) {
  return Boolean(readRecoveryProof(value, userId, secret, now));
}

export function recoveryProofCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: RECOVERY_PROOF_TTL_SECONDS,
  };
}
