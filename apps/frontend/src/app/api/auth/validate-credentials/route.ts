/**
 * Internal endpoint for Credentials provider: validates key or email/password.
 * Only callable with AUTH_SECRET. Keeps Node-only modules (crypto, mongodb) out of Edge.
 */
import { NextRequest, NextResponse } from "next/server";
import { validateAccessKey } from "@/lib/access-keys";
import { validateAuthUser } from "@/lib/auth-users";
import { validateCredentialsBodySchema } from "@/lib/api-request-schemas";
import { getClientIp, isTempBanned, recordLoginFailure, TEMP_BAN_WINDOW_SECONDS } from "@/lib/login-failures";

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
  const ip = getClientIp(request.headers);
  if (await isTempBanned(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many failed attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(TEMP_BAN_WINDOW_SECONDS) } }
    );
  }
  try {
    const body = await request.json();
    const parsed = validateCredentialsBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const { key, email, password } = parsed.data;

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
      await recordLoginFailure(ip, request.headers.get("user-agent") ?? undefined);
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
      await recordLoginFailure(ip, request.headers.get("user-agent") ?? undefined);
      return NextResponse.json({ ok: false });
    }
  } catch {
    // ignore
  }
  return NextResponse.json({ ok: false }, { status: 400 });
}
