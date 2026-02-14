import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/require-session";
import { resolveUserIdsForPortfolios, setDefaultPortfolioForUser } from "@/lib/tenant";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

/** GET /api/portfolios - List portfolios the current user is authorized for */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const userId = session.user.id;
    const username = (session.user as { username?: string | null }).username?.trim().toLowerCase() ?? "";
    const db = await getDb();
    const userIds = await resolveUserIdsForPortfolios(db, userId);
    const orClauses: Record<string, unknown>[] = [
      { authorizedUserIds: { $in: userIds } },
      { ownerId: { $in: userIds } },
    ];
    if (username) {
      orClauses.push({ authorizedUsers: username }, { ownerXHandle: username });
    }
    const list = await db
      .collection("portfolios")
      .find({ $or: orClauses })
      .sort({ createdAt: -1 })
      .project<{ _id: unknown; name: string }>({ _id: 1, name: 1 })
      .toArray();
    const portfolios = list.map((p) => ({
      id: (p._id as ObjectId).toString(),
      name: p.name,
    }));
    return NextResponse.json(portfolios);
  } catch (e) {
    console.error("[portfolios] GET failed", e);
    return NextResponse.json(
      { error: "Failed to list portfolios" },
      { status: 500 }
    );
  }
}

/** POST /api/portfolios - Create portfolio and set as current (cookie). Idempotent for "Default": if one exists for this user, return it. */
export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json().catch(() => ({}));
    const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Default";
    const userId = session.user.id;
    const db = await getDb();
    const existing =
      name === "Default"
        ? await db.collection("portfolios").findOne({
            ownerId: userId,
            name: "Default",
          })
        : null;
    if (existing) {
      const idStr = (existing._id as ObjectId).toString();
      await setDefaultPortfolioForUser(userId, idStr);
      const res = NextResponse.json({ id: idStr, name: existing.name }, { status: 200 });
      res.cookies.set("portfolioId", idStr, { path: "/", httpOnly: true, sameSite: "lax" });
      return res;
    }
    const now = new Date();
    const provider = (session.user as { provider?: string }).provider;
    const username = (session.user as { username?: string | null }).username;
    const ownerXId = provider === "twitter" ? userId : undefined;
    const ownerXHandle =
      provider === "twitter" && typeof username === "string" && username.trim()
        ? username.trim().toLowerCase()
        : undefined;
    const authorizedUsers =
      ownerXHandle !== undefined ? [ownerXHandle] : undefined;
    const result = await db.collection("portfolios").insertOne({
      name,
      ownerId: userId,
      ...(ownerXId !== undefined && { ownerXId }),
      ...(ownerXHandle !== undefined && { ownerXHandle }),
      authorizedUserIds: [userId],
      ...(authorizedUsers !== undefined && { authorizedUsers }),
      createdAt: now,
      updatedAt: now,
    });
    const idStr = result.insertedId.toString();
    await setDefaultPortfolioForUser(userId, idStr);
    const res = NextResponse.json({ id: idStr, name }, { status: 201 });
    res.cookies.set("portfolioId", idStr, { path: "/", httpOnly: true, sameSite: "lax" });
    return res;
  } catch (e) {
    console.error("[portfolios] POST failed", e);
    return NextResponse.json(
      { error: "Failed to create portfolio" },
      { status: 500 }
    );
  }
}
