import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/require-session";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

/** GET /api/portfolios/[id] - Get one portfolio (must be authorized) */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
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
    const portfolio = {
      id: (doc._id as ObjectId).toString(),
      name: doc.name,
      ownerId: doc.ownerId,
      authorizedUserIds: doc.authorizedUserIds ?? [],
      authorizedUsers: (doc as { authorizedUsers?: string[] }).authorizedUsers ?? [],
      defaultAccountName: doc.defaultAccountName ?? "",
      defaultBrokerName: doc.defaultBrokerName ?? "",
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
    return NextResponse.json(portfolio);
  } catch (e) {
    console.error("[portfolios] GET [id] failed", e);
    return NextResponse.json(
      { error: "Failed to load portfolio" },
      { status: 500 }
    );
  }
}

/** PATCH /api/portfolios/[id] - Update portfolio name and defaults */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    let oid: ObjectId;
    try {
      oid = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid portfolio id" }, { status: 400 });
    }
    const body = await request.json().catch(() => ({}));
    const db = await getDb();
    const existing = await db.collection("portfolios").findOne({ _id: oid });
    if (!existing) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
    }
    const userId = session.user.id;
    const username = (session.user as { username?: string | null }).username?.trim().toLowerCase() ?? "";
    const authorized =
      (existing.authorizedUserIds as string[] | undefined)?.includes(userId) ||
      existing.ownerId === userId ||
      (!!username && (((existing as { authorizedUsers?: string[] }).authorizedUsers)?.includes(username) || existing.ownerXHandle === username));
    if (!authorized) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
    }
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (typeof body.name === "string" && body.name.trim()) {
      update.name = body.name.trim();
    }
    if (typeof body.defaultAccountName === "string") {
      update.defaultAccountName = body.defaultAccountName.trim() || null;
    }
    if (typeof body.defaultBrokerName === "string") {
      update.defaultBrokerName = body.defaultBrokerName.trim() || null;
    }
    await db.collection("portfolios").updateOne({ _id: oid }, { $set: update });
    const updated = await db.collection("portfolios").findOne({ _id: oid });
    return NextResponse.json({
      id: (updated!._id as ObjectId).toString(),
      name: updated!.name,
      defaultAccountName: updated!.defaultAccountName ?? "",
      defaultBrokerName: updated!.defaultBrokerName ?? "",
      updatedAt: updated!.updatedAt,
    });
  } catch (e) {
    console.error("[portfolios] PATCH [id] failed", e);
    return NextResponse.json(
      { error: "Failed to update portfolio" },
      { status: 500 }
    );
  }
}

/** DELETE /api/portfolios/[id] - Delete portfolio (must be authorized). Does not delete accounts or other data; they become orphaned unless cleaned up. */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { id } = await ctx.params;
    let oid: ObjectId;
    try {
      oid = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid portfolio id" }, { status: 400 });
    }
    const db = await getDb();
    const existing = await db.collection("portfolios").findOne({ _id: oid });
    if (!existing) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
    }
    const userId = session.user.id;
    const username = (session.user as { username?: string | null }).username?.trim().toLowerCase() ?? "";
    const authorized =
      (existing.authorizedUserIds as string[] | undefined)?.includes(userId) ||
      existing.ownerId === userId ||
      (!!username && (((existing as { authorizedUsers?: string[] }).authorizedUsers)?.includes(username) || existing.ownerXHandle === username));
    if (!authorized) {
      return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
    }
    await db.collection("portfolios").deleteOne({ _id: oid });
    const res = NextResponse.json({ ok: true });
    const cookiePortfolioId = request.cookies.get("portfolioId")?.value?.trim();
    if (cookiePortfolioId === id) {
      res.cookies.set("portfolioId", "", { path: "/", maxAge: 0 });
    }
    return res;
  } catch (e) {
    console.error("[portfolios] DELETE [id] failed", e);
    return NextResponse.json(
      { error: "Failed to delete portfolio" },
      { status: 500 }
    );
  }
}
