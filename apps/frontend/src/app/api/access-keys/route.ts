import { NextRequest, NextResponse } from "next/server";
import { listAccessKeys, createAccessKey } from "@/lib/access-keys";
import { requireSessionFromRequest } from "@/lib/require-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  try {
    const keys = await listAccessKeys();
    return NextResponse.json(keys);
  } catch (e) {
    console.error("[access-keys] list failed", e);
    return NextResponse.json(
      { error: "Failed to list access keys" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  try {
    const body = await request.json();
    const name = typeof body.name === "string" ? body.name.trim() : "Unnamed";
    const { id, key } = await createAccessKey(name);
    return NextResponse.json({ id, key });
  } catch (e) {
    console.error("[access-keys] create failed", e);
    return NextResponse.json(
      { error: "Failed to create access key" },
      { status: 500 }
    );
  }
}
