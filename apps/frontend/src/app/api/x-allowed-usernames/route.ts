import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  listAllowedXUsernames,
  addAllowedXUsername,
  removeAllowedXUsername,
} from "@/lib/x-allowed-usernames";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const list = await listAllowedXUsernames();
    return NextResponse.json(list);
  } catch (e) {
    console.error("[x-allowed-usernames] list failed", e);
    return NextResponse.json(
      { error: "Failed to list allowed usernames" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const username = typeof body.username === "string" ? body.username : "";
    const result = await addAllowedXUsername(username);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? "Invalid request" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("[x-allowed-usernames] add failed", e);
    return NextResponse.json(
      { error: "Failed to add username" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const username = typeof body.username === "string" ? body.username : "";
    const ok = await removeAllowedXUsername(username);
    if (!ok) {
      return NextResponse.json(
        { error: "Username not found or invalid" },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[x-allowed-usernames] delete failed", e);
    return NextResponse.json(
      { error: "Failed to remove username" },
      { status: 500 }
    );
  }
}
