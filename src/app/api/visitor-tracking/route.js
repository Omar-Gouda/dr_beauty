import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const COOKIE_NAME = "drbeauty_visitor";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function secretValue() {
  return process.env.VISITOR_TRACKING_SECRET || "";
}

function signVisitorId(visitorId, secret) {
  return createHmac("sha256", secret).update(`cookie:${visitorId}`).digest("hex");
}

function getVerifiedVisitorId(cookieValue, secret) {
  const [visitorId, signature, extra] = String(cookieValue ?? "").split(".");
  if (extra || !/^[0-9a-f-]{36}$/i.test(visitorId ?? "") || !/^[0-9a-f]{64}$/i.test(signature ?? "")) return null;
  const expected = Buffer.from(signVisitorId(visitorId, secret), "hex");
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received) ? visitorId : null;
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Invalid origin." }, { status: 403 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret = secretValue();
  if (!url || !serviceKey || secret.length < 32) {
    return NextResponse.json({ error: "Visitor tracking is not configured." }, { status: 503 });
  }

  const cookieStore = await cookies();
  let visitorId = getVerifiedVisitorId(cookieStore.get(COOKIE_NAME)?.value, secret);
  const shouldSetCookie = !visitorId;
  if (!visitorId) visitorId = randomUUID();

  const visitorHash = createHmac("sha256", secret).update(`daily:${visitorId}`).digest("hex");
  try {
    const supabase = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
    const { error } = await supabase.rpc("record_admin_visitor", { p_visitor_hash: visitorHash });
    if (error) return NextResponse.json({ error: "Visitor tracking is temporarily unavailable." }, { status: 503 });
  } catch {
    return NextResponse.json({ error: "Visitor tracking is temporarily unavailable." }, { status: 503 });
  }

  const response = new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
  if (shouldSetCookie) {
    response.cookies.set(COOKIE_NAME, `${visitorId}.${signVisitorId(visitorId, secret)}`, {
      httpOnly: true,
      maxAge: COOKIE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
  }
  return response;
}
