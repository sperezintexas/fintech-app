import { NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";

/**
 * Use at the start of any API handler that must be authenticated.
 * Returns the session if authenticated, or a 401 NextResponse if not.
 * Callers should check: if (session instanceof NextResponse) return session;
 */
export async function requireSession(): Promise<Session | NextResponse> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return session;
}
