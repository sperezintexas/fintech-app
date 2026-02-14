import { NextRequest, NextResponse } from "next/server";
import { getActivePortfolio } from "@/lib/tenant";
import type { PortfolioDoc } from "@/types/portfolio";

export type RequestWithPortfolio = NextRequest & {
  context: { portfolio: PortfolioDoc };
};

export function withPortfolio(
  handler: (req: RequestWithPortfolio) => Promise<NextResponse>
) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const portfolio = await getActivePortfolio(req);
      const enhancedReq = req as RequestWithPortfolio;
      enhancedReq.context = { ...(enhancedReq as { context?: object }).context, portfolio };
      return handler(enhancedReq);
    } catch (err) {
      console.error("[withPortfolio]", err);
      return NextResponse.json(
        { error: "Unauthorized or missing portfolio" },
        { status: 401 }
      );
    }
  };
}
