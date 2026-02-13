import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { seedAllowedXUsernamesFromEnv } from "@/lib/x-allowed-usernames";

/**
 * POST /api/x-allowed-usernames/seed
 * Seeds auth_users from env ALLOWED_X_USERNAMES (comma-separated). No usernames in repo.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { added } = await seedAllowedXUsernamesFromEnv();
    return NextResponse.json({ ok: true, added });
  } catch (e) {
    console.error("[x-allowed-usernames] seed failed", e);
    return NextResponse.json(
      { error: "Seed failed" },
      { status: 500 }
    );
  }
}
