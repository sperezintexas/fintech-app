import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/require-session";
import { linkUserIdToCurrentUser } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/**
 * POST /api/user-settings/link-id
 * Body: { linkId: string }
 * Links another user id (e.g. from a different login method) so portfolios/accounts for that id are visible.
 * Use when you created data with one login (e.g. access key, id "key") and now log in with another (e.g. Twitter).
 */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const linkId = typeof body?.linkId === "string" ? body.linkId.trim() : "";
    if (!linkId) {
      return NextResponse.json({ error: "linkId is required" }, { status: 400 });
    }
    await linkUserIdToCurrentUser(session.user.id, linkId);
    return NextResponse.json({ ok: true, linkedId: linkId });
  } catch (e) {
    console.error("[user-settings] link-id failed", e);
    return NextResponse.json(
      { error: "Failed to link id" },
      { status: 500 }
    );
  }
}
