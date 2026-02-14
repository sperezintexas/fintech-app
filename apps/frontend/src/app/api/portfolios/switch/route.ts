import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { requireSessionFromRequest } from "@/lib/require-session";
import { setDefaultPortfolioForUser } from "@/lib/tenant";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

/** POST /api/portfolios/switch - Set current portfolio (cookie + persisted default). Must be authorized. */
export async function POST(request: NextRequest) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  try {
    const body = await request.json().catch(() => ({}));
    const id = typeof body.portfolioId === "string" ? body.portfolioId.trim() : "";
    if (!id) {
      return NextResponse.json({ error: "portfolioId required" }, { status: 400 });
    }
    let oid: ObjectId;
    try {
      oid = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid portfolio id" }, { status: 400 });
    }
    const db = await getDb();
    const doc = await db.collection("portfolios").findOne({ _id: oid });
    if (!doc) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
    }
    const userId = session.user.id;
    const username = (session.user as { username?: string | null }).username?.trim().toLowerCase() ?? "";
    const authorized =
      (doc.authorizedUserIds as string[] | undefined)?.includes(userId) ||
      doc.ownerId === userId ||
      (!!username && ((doc.authorizedUsers as string[] | undefined)?.includes(username) || doc.ownerXHandle === username));
    if (!authorized) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
    }
    await setDefaultPortfolioForUser(session.user.id, id);
    const res = NextResponse.json({ ok: true, portfolioId: id });
    res.cookies.set("portfolioId", id, { path: "/", httpOnly: true, sameSite: "lax" });
    return res;
  } catch (e) {
    console.error("[portfolios] switch failed", e);
    return NextResponse.json(
      { error: "Failed to switch portfolio" },
      { status: 500 }
    );
  }
}
