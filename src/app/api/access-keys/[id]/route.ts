import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { revokeAccessKey } from "@/lib/access-keys";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
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
