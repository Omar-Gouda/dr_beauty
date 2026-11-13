import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("ranking settings default hidden and public projections expose only privacy-aware aggregates", async () => {
  const migration = await read("../supabase/migrations/20261205000000_storefront_customer_rankings_visibility.sql");
  const loader = await read("../src/lib/catalog.js");
  const homepage = await read("../src/app/(store)/page.js");
  const component = await read("../src/components/home/CustomerRankings.jsx");
  assert.match(migration, /show_loved_by_dr_beauty boolean not null default false/i);
  assert.match(migration, /show_dr_beauty_elites boolean not null default false/i);
  assert.match(migration, /where settings\.singleton is true[\s\S]*?show_loved_by_dr_beauty/);
  assert.match(migration, /case when coalesce\(profile\.show_public_ranking, true\)[\s\S]*?'Private member'/i);
  assert.match(migration, /analytics\.is_delivered[\s\S]*?limit 5/i);
  assert.match(migration, /analytics\.is_paid_and_delivered[\s\S]*?limit 3/i);
  assert.doesNotMatch(migration, /'account_id'|'email'|'phone'/i);
  assert.match(migration, /get_public_storefront_customer_rankings\(\)[\s\S]*?security definer[\s\S]*?set search_path = ''/i);
  assert.match(migration, /grant execute on function public\.get_public_storefront_customer_rankings\(\)\s+to anon, authenticated/i);
  assert.match(loader, /rpc\("get_public_storefront_customer_rankings"\)/);
  assert.match(homepage, /rankingsEnabled && <CustomerRankings/);
  assert.match(component, /Loved by DR\. Beauty/);
  assert.match(component, /DR\. Beauty Elites/);
  assert.match(component, /Our community is growing/);
});

test("admin ranking visibility updates are authenticated, server-authorized, and persisted by RPC", async () => {
  const migration = await read("../supabase/migrations/20261205000000_storefront_customer_rankings_visibility.sql");
  const actions = await read("../src/app/admin/actions.js");
  const form = await read("../src/components/admin/AdminRankingVisibility.jsx");
  const dashboardData = await read("../src/lib/admin.js");
  assert.match(migration, /update_admin_storefront_ranking_visibility\([\s\S]*?private\.is_admin\(\)/i);
  assert.match(migration, /revoke all on function public\.update_admin_storefront_ranking_visibility[\s\S]*?grant execute on function public\.update_admin_storefront_ranking_visibility[\s\S]*?to authenticated/i);
  assert.match(actions, /export async function updateStorefrontRankingVisibility/);
  assert.match(actions, /authorizedClient\(\)/);
  assert.match(actions, /rpc\("update_admin_storefront_ranking_visibility"/);
  assert.match(actions, /revalidatePath\("\/"\)/);
  assert.match(form, /Save visibility/);
  assert.match(form, /useToast/);
  assert.match(dashboardData, /from\("storefront_ranking_settings"\)/);
});

test("mobile hamburger preserves shopping destinations and supports modal keyboard, close, scroll, and safe-area behavior", async () => {
  const navbar = await read("../src/components/layout/Navbar.jsx");
  const dialog = await read("../src/components/ui/AccessibleDialog.jsx");
  const css = await read("../src/app/globals.css");
  const layouts = await Promise.all([
    read("../src/components/layout/StoreLayout.jsx"),
    read("../src/app/(account)/layout.js"),
    read("../src/app/(checkout)/layout.js"),
  ]);
  for (const destination of ["/", "/shop", "/offers", "/beauty-tips", "/about", "/support", "/orders", "/wishlist"]) assert.ok(navbar.includes(`href: "${destination}"`) || navbar.includes(`href="${destination}"`));
  assert.match(navbar, /aria-expanded=\{mobileMenuOpen\}/);
  assert.match(navbar, /aria-controls="mobile-store-navigation-dialog"/);
  assert.match(dialog, /dialog\.showModal\(\)/);
  assert.match(dialog, /onCancel=/);
  assert.match(dialog, /closeRef\.current\?\.\(\)/);
  assert.match(dialog, /previousFocus\.focus\(\)/);
  assert.match(navbar, /document\.body\.style\.overflow = "hidden"/);
  assert.match(css, /mobile-menu-panel\.is-closing/);
  assert.match(css, /overscroll-behavior: contain/);
  assert.match(css, /env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /env\(safe-area-inset-right, 0px\)/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /env\(safe-area-inset-left, 0px\)/);
  assert.match(css, /padding-right: max\(24px/);
  assert.match(css, /padding-left: max\(24px/);
  assert.match(css, /backdrop-filter: blur\(18px\)/);
  assert.match(css, /@supports not[\s\S]*?background: rgb\(255 249 247 \/ 97%\)/);
  assert.match(css, /\.mobile-menu-panel \.mobile-menu-muted\s*\{\s*color: #59464b/);
  assert.match(css, /\.mobile-menu-panel \.mobile-menu-accent\s*\{\s*color: #985364/);
  assert.match(css, /\.mobile-menu-panel a:focus-visible[\s\S]*?outline: 2px solid/);
  assert.match(css, /@media \(max-width: 359px\)[\s\S]*?width: min\(92vw, 390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(navbar, /mobile-menu-muted/);
  assert.match(navbar, /mobile-menu-accent/);
  for (const layout of layouts) assert.doesNotMatch(layout, /MobileBottomNavigation/);
  assert.match(navbar, /Dr\. Beauty[\s\S]*?Dr\. Radwa Hassan/);
});

test("admin return navigation says Back to the Store and keeps the home destination", async () => {
  const header = await read("../src/components/admin/AdminHeader.jsx");
  assert.match(header, /href="\/"[\s\S]*?Back to the Store/);
  assert.doesNotMatch(header, />\s*Storefront\s*</);
});

test("Elites uses readable Dr. Beauty theme tokens and footer signature uses the provided public email", async () => {
  const rankings = await read("../src/components/home/CustomerRankings.jsx");
  const footer = await read("../src/components/layout/Footer.jsx");
  const styles = await read("../src/app/globals.css");
  const elites = rankings.slice(rankings.indexOf("function ElitesSection"), rankings.indexOf("export default function CustomerRankings"));
  assert.match(elites, /DR\. Beauty Elites/);
  assert.match(elites, /bg-\[var\(--color-surface\)\]/);
  assert.match(elites, /text-\[var\(--color-text\)\]/);
  assert.match(elites, /via-\[var\(--color-background\)\]/);
  assert.doesNotMatch(elites, /#[0-9a-f]{3,8}|text-white|white\//i);
  assert.match(footer, /mailto:omarg\.dev1@gmail\.com[\s\S]*?Omar Gouda/);
  assert.match(footer, /© 2026 Dr\. Beauty\. All rights reserved\./);
  assert.match(footer, /Developed by[\s\S]*?mailto:omarg\.dev1@gmail\.com[\s\S]*?Omar Gouda/);
  assert.equal((footer.match(/Omar Gouda/g) ?? []).length, 1);
  assert.match(styles, /--color-rose: #B76E79/);
});

test("customer rankings show only names and medal-style ranks in independent responsive columns", async () => {
  const rankings = await read("../src/components/home/CustomerRankings.jsx");
  const component = rankings.slice(rankings.indexOf("function LovedBySection"));
  assert.match(component, /md:grid-cols-2/);
  assert.match(component, /border-\[#b48a3b\]/);
  assert.match(component, /border-\[#92979a\]/);
  assert.match(component, /border-\[#ad7659\]/);
  assert.match(component, /row\.displayName/);
  assert.doesNotMatch(component, /row\.(?:orderCount|purchaseValue|amount|count)/);
  assert.doesNotMatch(component, /[🏅🥇🥈🥉]/u);
});

test("navbar renders account links from server-resolved auth state and keeps sign out mobile-only", async () => {
  const [navbar, sessionNavbar, signOut, storeLayout, accountLayout, checkoutLayout] = await Promise.all([
    read("../src/components/layout/Navbar.jsx"),
    read("../src/components/layout/SessionAwareNavbar.jsx"),
    read("../src/components/layout/MobileSignOutForm.jsx"),
    read("../src/components/layout/StoreLayout.jsx"),
    read("../src/app/(account)/layout.js"),
    read("../src/app/(checkout)/layout.js"),
  ]);
  const desktop = navbar.slice(navbar.indexOf("{/* Desktop Navigation Links */}"), navbar.indexOf("<div className=\"lg:hidden\">"));
  const mobile = navbar.slice(navbar.indexOf("{mobileMenuOpen &&"));
  assert.match(sessionNavbar, /supabase\.auth\.getUser\(\)/);
  assert.match(sessionNavbar, /initialAuthenticated/);
  assert.match(navbar, /onAuthStateChange/);
  assert.match(navbar, /authenticated === true &&/);
  assert.doesNotMatch(desktop, /Sign In|Create Account|Sign Up/);
  assert.match(desktop, /authenticated === true[\s\S]*?<User/);
  assert.match(navbar.slice(navbar.indexOf("{mobileMenuOpen &&")), /Sign In[\s\S]*?Create Account/);
  assert.doesNotMatch(desktop, /Sign Out/);
  assert.match(mobile, /authenticated === true[\s\S]*?<MobileSignOutForm/);
  assert.match(signOut, /action=\{logout\}/);
  assert.match(signOut, /disabled=\{pending\}/);
  assert.match(signOut, /Signing out/);
  assert.match(storeLayout, /<SessionAwareNavbar/);
  assert.match(accountLayout, /<SessionAwareNavbar mobileOnly/);
  assert.match(checkoutLayout, /<SessionAwareNavbar/);
});

test("profile ranking requires an explicit opt-in separate from admin display switches", async () => {
  const profile = await read("../src/components/account/ProfileEditor.jsx");
  const accountAction = await read("../src/app/(account)/actions.js");
  const analyticsMigration = await read("../supabase/migrations/20261203000000_admin_user_dashboard_analytics.sql");
  const displayMigration = await read("../supabase/migrations/20261205000000_storefront_customer_rankings_visibility.sql");
  const consentMigration = await read("../supabase/migrations/20261208000000_legal_policy_revision_explicit_ranking_optin.sql");
  assert.match(analyticsMigration, /show_public_ranking boolean not null default true/i);
  assert.match(profile, /I agree to show my name in customer rankings/);
  assert.match(profile, /draft\.showPublicRanking === true/);
  assert.match(accountAction, /update\(\{ full_name: fullName, phone: phone \|\| null, show_public_ranking: showPublicRanking \}\)/);
  assert.match(displayMigration, /coalesce\(profile\.show_public_ranking, true\)/i);
  assert.match(consentMigration, /alter column show_public_ranking set default false/i);
  assert.match(consentMigration, /update public\.profiles[\s\S]*?set show_public_ranking = false/i);
  assert.match(analyticsMigration, /create table private\.customer_purchase_analytics\s*\([\s\S]*?order_id uuid primary key/i);
  assert.doesNotMatch(analyticsMigration, /create table private\.customer_purchase_analytics\s*\([\s\S]*?references public\.orders/i);
});
