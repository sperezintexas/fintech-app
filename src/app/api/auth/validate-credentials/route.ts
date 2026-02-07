/**
 * Internal endpoint for Credentials provider: validates key or email/password.
 * Only callable with AUTH_SECRET. Keeps Node-only modules (crypto, mongodb) out of Edge.
 */
import { NextRequest, NextResponse } from "next/server";
import { validateAccessKey } from "@/lib/access-keys";
import { validateAuthUser } from "@/lib/auth-users";

const AUTH_SECRET = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!AUTH_SECRET || authHeader !== `Bearer ${AUTH_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const body = await request.json();
    const key = typeof body.key === "string" ? body.key : undefined;
    const email = typeof body.email === "string" ? body.email : undefined;
    const password = typeof body.password === "string" ? body.password : undefined;

    if (key) {
      const ok = await validateAccessKey(key);
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
