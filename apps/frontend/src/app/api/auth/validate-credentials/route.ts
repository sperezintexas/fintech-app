/**
 * Internal endpoint for Credentials provider: validates key or email/password.
 * Only callable with AUTH_SECRET. Keeps Node-only modules (crypto, mongodb) out of Edge.
 */
import { NextRequest, NextResponse } from "next/server";
import { validateAccessKey } from "@/lib/access-keys";
import { validateAuthUser } from "@/lib/auth-users";

const AUTH_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
const AUTH_DEBUG = process.env.AUTH_DEBUG === "true" || process.env.AUTH_DEBUG === "1";

export async function POST(request: NextRequest) {
  // Log when AUTH_DEBUG is set so you can confirm env (use apps/frontend/.env.local; look at terminal where pnpm dev runs)
  if (process.env.AUTH_DEBUG !== undefined) {
    console.log("[auth] validate-credentials called", { AUTH_DEBUG, raw: process.env.AUTH_DEBUG });
  }

  const authHeader = request.headers.get("authorization");
  const secretMatch = !!AUTH_SECRET && authHeader === `Bearer ${AUTH_SECRET}`;

  if (AUTH_DEBUG) {
    console.log("[auth] validate-credentials", {
      hasAuthHeader: !!authHeader,
      secretMatch,
      hasAUTH_SECRET: !!AUTH_SECRET,
      hasACCESS_KEY_SEED: !!process.env.ACCESS_KEY_SEED,
    });
  }

  if (!AUTH_SECRET || !secretMatch) {
    if (AUTH_DEBUG) console.error("[auth] validate-credentials: 401 (missing or wrong AUTH_SECRET)");
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const body = await request.json();
    const key = typeof body.key === "string" ? body.key : undefined;
    const email = typeof body.email === "string" ? body.email : undefined;
    const password = typeof body.password === "string" ? body.password : undefined;

    if (key) {
      const ok = await validateAccessKey(key);
      if (AUTH_DEBUG) {
        console.log("[auth] validate-credentials key check", {
          keyLength: key.length,
          keyTrimmedLength: key.trim().length,
          validateAccessKeyResult: ok,
          hasACCESS_KEY_SEED: !!process.env.ACCESS_KEY_SEED,
        });
        if (!ok && !process.env.ACCESS_KEY_SEED) {
          console.warn("[auth] ACCESS_KEY_SEED is not set. Add it to apps/frontend/.env.local (Next.js loads env from apps/frontend only).");
        }
      }
      if (ok) {
        return NextResponse.json({
          ok: true,
          user: { id: "key", name: "Key holder", email: null },
        });
      }
      return NextResponse.json({ ok: false });
    }
    if (email && password) {
      const ok = await validateAuthUser(email, password);
      if (ok) {
        return NextResponse.json({
          ok: true,
          user: { id: email, name: email, email },
        });
      }
      return NextResponse.json({ ok: false });
    }
  } catch {
    // ignore
  }
  return NextResponse.json({ ok: false }, { status: 400 });
}
