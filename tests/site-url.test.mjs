import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getAuthCallbackUrl, getSiteUrl } from "../src/lib/site-url.mjs";

test("site URL normalizes production origin and trailing slash", () => {
  assert.equal(
    getSiteUrl({ siteUrl: "https://shop.example.test/", nodeEnv: "production" }),
    "https://shop.example.test",
  );
});

test("site URL uses localhost only as a development default", () => {
  assert.equal(getSiteUrl({ siteUrl: "", nodeEnv: "development" }), "http://localhost:3000");
  assert.throws(() => getSiteUrl({ siteUrl: "", nodeEnv: "production" }));
  assert.throws(() => getSiteUrl({ siteUrl: "http://localhost:3000", nodeEnv: "production" }));
});

test("site URL rejects unsafe or non-origin configuration", () => {
  for (const siteUrl of [
    "not a URL",
    "http://shop.example.test",
    "https://user:password@shop.example.test",
    "https://shop.example.test/path",
    "https://shop.example.test/?next=//outside.test",
  ]) {
    assert.throws(() => getSiteUrl({ siteUrl, nodeEnv: "production" }));
  }
});

test("signup and recovery use the current site's PKCE confirmation callback", () => {
  assert.equal(
    getAuthCallbackUrl("/profile", { siteUrl: "https://shop.example.test/", nodeEnv: "production" }),
    "https://shop.example.test/auth/confirm?next=%2Fprofile",
  );
  assert.equal(
    getAuthCallbackUrl("/reset-password", { siteUrl: "", nodeEnv: "development" }),
    "http://localhost:3000/auth/confirm?next=%2Freset-password",
  );
  assert.throws(() => getAuthCallbackUrl("//outside.test", { siteUrl: "https://shop.example.test", nodeEnv: "production" }));
});

test("auth actions keep the custom redirect options and confirmation template link", async () => {
  const [actions, confirmationRoute, emailTemplate] = await Promise.all([
    readFile(new URL("../src/app/(account)/actions.js", import.meta.url), "utf8"),
    readFile(new URL("../src/app/auth/confirm/route.js", import.meta.url), "utf8"),
    readFile(new URL("../supabase/templates/confirmation.html", import.meta.url), "utf8"),
  ]);

  assert.match(actions, /emailRedirectTo,/);
  assert.match(actions, /resetPasswordForEmail\(email, \{ redirectTo \}\)/);
  assert.match(confirmationRoute, /exchangeCodeForSession\(code\)/);
  assert.match(confirmationRoute, /verifyOtp\(\{ token_hash: tokenHash, type \}\)/);
  assert.match(emailTemplate, /href="\{\{ \.ConfirmationURL \}\}"/);
});

test("nested account store shells leave one mobile shell and retain desktop chrome", async () => {
  const [accountLayout, storeLayout, nestedLayouts] = await Promise.all([
    readFile(new URL("../src/app/(account)/layout.js", import.meta.url), "utf8"),
    readFile(new URL("../src/components/layout/StoreLayout.jsx", import.meta.url), "utf8"),
    Promise.all([
      "../src/app/(account)/profile/layout.js",
      "../src/app/(account)/addresses/layout.js",
      "../src/app/(account)/orders/layout.js",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8"))),
  ]);

  assert.match(accountLayout, /<SessionAwareNavbar mobileOnly\s*\/>/);
  assert.doesNotMatch(accountLayout, /MobileBottomNavigation/);
  assert.doesNotMatch(storeLayout, /MobileBottomNavigation/);
  assert.match(storeLayout, /<SessionAwareNavbar desktopOnly=\{desktopChromeOnly\}/);
  assert.match(storeLayout, /<Footer desktopOnly=\{desktopChromeOnly\}/);
  for (const layout of nestedLayouts) assert.match(layout, /<StoreLayout desktopChromeOnly>/);
});
