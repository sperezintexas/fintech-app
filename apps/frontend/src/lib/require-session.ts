import { NextRequest, NextResponse } from "next/server";
import { cookies, headers as nextHeaders } from "next/headers";
import { auth } from "@/auth";
import type { Session } from "next-auth";

const AUTH_DEBUG = process.env.AUTH_DEBUG === "true" || process.env.AUTH_DEBUG === "1";

/**
 * Get session in Route Handlers. Tries request.headers first, then next/headers (cookies),
 * then calls the session endpoint with that cookie.
 */
export async function getSessionFromRequest(
  request: NextRequest
): Promise<Session | null> {
  // Try request.headers first (what the client actually sent), then next/headers
  let cookie = request.headers.get("cookie");
  if (!cookie?.trim()) {
    const h = await nextHeaders();
    cookie = h.get("cookie");
  }
  if (!cookie?.trim()) {
    const cookieStore = await cookies();
    cookie = cookieStore.getAll().map((c) => `${c.name}=${c.value}`).join("; ");
  }
  if (!cookie?.trim()) {
    if (AUTH_DEBUG) console.log("[getSessionFromRequest] no cookie (request.headers, next/headers, cookies() all empty)");
    return null;
  }

  const base =
    request.nextUrl?.origin ??
    process.env.NEXTAUTH_URL ??
    process.env.AUTH_URL ??
    "http://localhost:3000";
  const url = `${base.replace(/\/$/, "")}/api/auth/session`;

  try {
    const res = await fetch(url, {
      headers: { cookie, host: request.nextUrl?.host ?? new URL(base).host },
      cache: "no-store",
    });
    const data = (await res.json()) as Session | { user?: { id?: string; [k: string]: unknown } };
    if (AUTH_DEBUG) {
      console.log("[getSessionFromRequest] fetch", url, "status", res.status, "hasUser", !!data?.user, "userId", data?.user && "id" in data.user ? (data.user as { id?: string }).id : "no-id");
    }
    if (!res.ok) return null;
    if (data?.user) return data as Session;
    if (AUTH_DEBUG) console.log("[getSessionFromRequest] session response had no user", typeof data?.user);
  } catch (e) {
    if (AUTH_DEBUG) console.log("[getSessionFromRequest] fetch error", e);
  }
  return (await auth()) ?? null;
}

/**
 * Get session from request or return 401. Use in Route Handlers for consistent session resolution.
 * Usage: const session = await requireSessionFromRequest(request);
 *        if (session instanceof NextResponse) return session;
 */
export async function requireSessionFromRequest(
  request: NextRequest
): Promise<Session | NextResponse> {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}

/**
 * @deprecated Prefer requireSessionFromRequest(request) in Route Handlers so session is read from the request cookie.
 */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}
