import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import type { Session } from "next-auth";
import { getDb } from "@/lib/mongodb";
import type { PortfolioDoc } from "@/types/portfolio";
import { ObjectId } from "mongodb";

const UNAUTHORIZED_JSON = { error: "Unauthorized" };
const UNAUTHORIZED_PORTFOLIO_JSON = { error: "Unauthorized or missing portfolio" };
export const NO_PORTFOLIO_CODE = "NO_PORTFOLIO";
export const NO_PORTFOLIO_JSON = { error: "No portfolio", code: NO_PORTFOLIO_CODE };

/** Use inside auth()-wrapped handlers. Returns portfolio, 401, or 404 (no portfolio). */
export async function getPortfolioOr401Response(
  req: NextRequest,
  session: Session | null
): Promise<
  | { ok: true; portfolio: PortfolioDoc }
  | { ok: false; response: NextResponse }
> {
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json(UNAUTHORIZED_JSON, { status: 401 }),
    };
  }
  try {
    const portfolio = await getActivePortfolio(req, session);
    return { ok: true, portfolio };
  } catch (err) {
    if (err instanceof Error && err.message === NO_PORTFOLIO_CODE) {
      return {
        ok: false,
        response: NextResponse.json(NO_PORTFOLIO_JSON, { status: 404 }),
      };
    }
    return {
      ok: false,
      response: NextResponse.json(UNAUTHORIZED_PORTFOLIO_JSON, { status: 401 }),
    };
  }
}

type PortfolioRow = PortfolioDoc & { _id: ObjectId };

type UserSettingsRow = { _id: string; defaultPortfolioId?: string; linkedUserIds?: string[] };

/** Persist the user's default portfolio so it's used when no cookie/header (e.g. new device or cleared cookies). */
export async function setDefaultPortfolioForUser(
  userId: string,
  portfolioId: string
): Promise<void> {
  const db = await getDb();
  await db.collection<UserSettingsRow>("userSettings").updateOne(
    { _id: userId },
    { $set: { defaultPortfolioId: portfolioId, _id: userId } },
    { upsert: true }
  );
}

/** Add another user id (e.g. from a different login method) so portfolios for that id are visible. Use when same person logs in with Twitter vs access key. */
export async function linkUserIdToCurrentUser(
  userId: string,
  linkId: string
): Promise<void> {
  const trimmed = linkId?.trim();
  if (!trimmed || trimmed === userId) return;
  const db = await getDb();
  await db.collection<UserSettingsRow>("userSettings").updateOne(
    { _id: userId },
    { $addToSet: { linkedUserIds: trimmed }, $set: { _id: userId } },
    { upsert: true }
  );
}

/** Resolve all user ids to consider for portfolio/account scope (current + linked). Exported for GET /api/portfolios. */
export async function resolveUserIdsForPortfolios(db: Awaited<ReturnType<typeof getDb>>, userId: string): Promise<string[]> {
  const settings = await db.collection<UserSettingsRow>("userSettings").findOne(
    { _id: userId },
    { projection: { linkedUserIds: 1 } }
  );
  const linked = settings?.linkedUserIds ?? [];
  const ids = [userId, ...linked.filter((id): id is string => typeof id === "string" && id.trim() !== "" && id !== userId)];
  return [...new Set(ids)];
}

/**
 * Resolve the active portfolio for the current user. Requires an existing portfolio (no auto-creation).
 * Precedence: x-portfolio-id header > saved default (userSettings) > portfolioId cookie > first authorized portfolio.
 * When the user has no portfolio, throws NO_PORTFOLIO so callers can return 404 and prompt to create one in Setup.
 */
export async function getActivePortfolio(
  req?: NextRequest,
  sessionOverride?: Session | null
): Promise<PortfolioDoc> {
  const session =
    sessionOverride !== undefined ? sessionOverride : await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const userId = session.user.id;
  const username = (session.user as { username?: string | null }).username?.trim().toLowerCase() ?? "";

  const db = await getDb();
  const userIds = await resolveUserIdsForPortfolios(db, userId);
  const orClauses: Record<string, unknown>[] = [
    { authorizedUserIds: { $in: userIds } },
    { ownerId: { $in: userIds } },
  ];
  if (username) {
    orClauses.push({ authorizedUsers: username });
    orClauses.push({ ownerXHandle: username });
  }
  const portfolios = (await db
    .collection<PortfolioRow>("portfolios")
    .find({ $or: orClauses })
    .sort({ createdAt: -1 })
    .limit(10)
    .toArray()) as PortfolioRow[];

  if (portfolios.length === 0) {
    const totalInDb = await db.collection<PortfolioRow>("portfolios").countDocuments();
    console.warn("[tenant] NO_PORTFOLIO: no portfolio matched", {
      userId,
      username: username || "(none)",
      userIds,
      totalPortfoliosInDb: totalInDb,
      hint: "Ensure portfolio has ownerId or authorizedUserIds in userIds, or ownerXHandle/authorizedUsers matching username",
    });
    throw new Error(NO_PORTFOLIO_CODE);
  }

  // Repair: ensure owner is in authorizedUserIds and ownerXHandle is in authorizedUsers
  for (const p of portfolios) {
    const addToSet: Record<string, string> = {};
    if (p.ownerId === userId && !(p.authorizedUserIds ?? []).includes(userId)) {
      addToSet.authorizedUserIds = userId;
      (p as PortfolioRow).authorizedUserIds = [...(p.authorizedUserIds ?? []), userId];
    }
    const ownerHandle = (p.ownerXHandle ?? "").trim().toLowerCase();
    if (ownerHandle && !(p.authorizedUsers ?? []).includes(ownerHandle)) {
      addToSet.authorizedUsers = ownerHandle;
      (p as PortfolioRow).authorizedUsers = [...(p.authorizedUsers ?? []), ownerHandle];
    }
    if (Object.keys(addToSet).length > 0) {
      await db.collection<PortfolioRow>("portfolios").updateOne(
        { _id: p._id },
        { $addToSet: addToSet }
      );
    }
  }

  // 1) Explicit request override
  if (req) {
    const headerId = req.headers.get("x-portfolio-id")?.trim();
    if (headerId) {
      const found = portfolios.find((p) => p._id.toString() === headerId);
      if (found) {
        return { ...found, _id: found._id.toString() };
      }
    }
  }
  // 2) Configured default from Setup (dashboard uses this when set)
  const savedDefaultId = (
    await db.collection<UserSettingsRow>("userSettings").findOne(
      { _id: userId },
      { projection: { defaultPortfolioId: 1 } }
    )
  )?.defaultPortfolioId?.trim();
  if (savedDefaultId) {
    const found = portfolios.find((p) => p._id.toString() === savedDefaultId);
    if (found) {
      return { ...found, _id: found._id.toString() };
    }
  }
  // 3) Cookie (e.g. when no saved default yet)
  if (req) {
    const cookieId = req.cookies.get("portfolioId")?.value?.trim();
    if (cookieId) {
      const found = portfolios.find((p) => p._id.toString() === cookieId);
      if (found) {
        return { ...found, _id: found._id.toString() };
      }
    }
  }
  const first = portfolios[0];
  return {
    ...first,
    _id: first._id.toString(),
  };
}

export function assertPortfolioId(
  id: string | undefined
): asserts id is string {
  if (!id) throw new Error("portfolioId required in tenant context");
}
