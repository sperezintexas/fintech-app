import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { createAuthUser } from "@/lib/auth-users";

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();
    const email = typeof body.email === "string" ? body.email : "";
    const password = typeof body.password === "string" ? body.password : "";
    const ok = await createAuthUser(email, password);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid input or email already exists" },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    console.error("[auth-users] create failed", e);
    return NextResponse.json(
      { error: "Failed to create user" },
      { status: 500 }
    );
  }
}
