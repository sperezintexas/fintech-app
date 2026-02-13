import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getLoginHistory, recordLoginSuccess } from "@/lib/login-history";
import { getClientIp } from "@/lib/login-failures";

export const dynamic = "force-dynamic";

const RECORD_COOKIE = "login_history_recorded";
const RECORD_COOKIE_MAX_AGE = 30 * 60; // 30 minutes

/** GET /api/login-history - Returns success count, failed count, and recent attempts (auth required). */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const windowDays = Math.min(365, Math.max(1, Number(searchParams.get("days")) || 30));
  const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit")) || 50));

  try {
    const result = await getLoginHistory(windowDays, limit);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[login-history] GET failed:", e);
    return NextResponse.json({ error: "Failed to load login history" }, { status: 500 });
  }
}

/** POST /api/login-history - Record a successful login (once per 30 min per browser via cookie). Auth required. */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookie = request.cookies.get(RECORD_COOKIE);
  if (cookie?.value === "1") {
    return NextResponse.json({ recorded: false });
  }

  const ip = getClientIp(request.headers);
  const userAgent = request.headers.get("user-agent") ?? undefined;
  const userId = (session.user as { id?: string }).id ?? session.user.email ?? undefined;

  try {
    await recordLoginSuccess(ip, userAgent, userId);
  } catch (e) {
    console.error("[login-history] record success failed:", e);
    return NextResponse.json({ error: "Failed to record" }, { status: 500 });
  }

  const res = NextResponse.json({ recorded: true });
  res.cookies.set(RECORD_COOKIE, "1", {
    maxAge: RECORD_COOKIE_MAX_AGE,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
  });
  return res;
}
