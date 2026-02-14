import { NextRequest, NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/require-session";
import { getActivePortfolio, NO_PORTFOLIO_CODE } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** GET /api/portfolios/current - Active portfolio for this request. Returns 404 when user has no portfolio. */
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const portfolio = await getActivePortfolio(request, session);
    const res = NextResponse.json({
      id: portfolio._id,
      name: portfolio.name,
      defaultAccountName: portfolio.defaultAccountName ?? "",
      defaultBrokerName: portfolio.defaultBrokerName ?? "",
      ownerId: portfolio.ownerId,
      authorizedUserIds: portfolio.authorizedUserIds,
      authorizedUsers: portfolio.authorizedUsers ?? [],
      createdAt: portfolio.createdAt,
      updatedAt: portfolio.updatedAt,
    });
    res.cookies.set("portfolioId", portfolio._id, { path: "/", httpOnly: true, sameSite: "lax" });
    return res;
  } catch (err) {
    if (err instanceof Error && err.message === NO_PORTFOLIO_CODE) {
      return NextResponse.json({ error: "No portfolio", code: NO_PORTFOLIO_CODE }, { status: 404 });
    }
    console.error("[portfolios] current failed", err);
    return NextResponse.json({ error: "Unauthorized or no portfolio" }, { status: 401 });
  }
}
