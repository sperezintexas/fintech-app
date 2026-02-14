import { NextRequest, NextResponse } from "next/server";
import { revokeAccessKey } from "@/lib/access-keys";
import { requireSessionFromRequest } from "@/lib/require-session";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }
  try {
    const ok = await revokeAccessKey(id);
    if (!ok) {
      return NextResponse.json({ error: "Key not found or already revoked" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[access-keys] revoke failed", e);
    return NextResponse.json(
      { error: "Failed to revoke access key" },
      { status: 500 }
    );
  }
}
