import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/require-session";
import { getPortfolioOr401Response } from "@/lib/tenant";
import { getMultipleTickerPrices } from "@/lib/yahoo";
import type { Account, Portfolio } from "@/types/portfolio";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

// GET /api/dashboard - Get dashboard summary with live prices. Uses default portfolio (saved default > cookie > first).
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  const result = await getPortfolioOr401Response(request, session);
  if (!result.ok) return result.response;
  const { portfolio } = result;
  try {
    const db = await getDb();
    type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId; portfolioId?: string };
    const accounts = await db
      .collection<AccountDoc>("accounts")
      .find({ portfolioId: portfolio._id })
      .toArray();

    // Collect all unique tickers from positions
    const tickers = new Set<string>();
    for (const account of accounts) {
      for (const position of account.positions) {
        if (position.ticker) {
          tickers.add(position.ticker);
        }
      }
    }

    // Fetch live prices for all tickers
    const prices = await getMultipleTickerPrices(Array.from(tickers));

    // Update positions with live prices and calculate values
    let totalValue = 0;
    let totalDailyChange = 0;
    let totalCostBasis = 0;

    const accountsWithLivePrices: Account[] = accounts.map((account) => {
      let accountValue = 0;
      let accountDailyChange = 0;
      let accountCostBasis = 0;

      // If account has positions, calculate value from positions
      if (account.positions && account.positions.length > 0) {
        const updatedPositions = account.positions.map((position) => {
          if (position.type === "cash") {
            const amount = position.amount || 0;
            accountValue += amount;
            accountCostBasis += amount;
            return position;
          }

          if (position.type === "stock" && position.ticker) {
            const livePrice = prices.get(position.ticker);
            const currentPrice = livePrice?.price || position.currentPrice || 0;
            const shares = position.shares || 0;
            const purchasePrice = position.purchasePrice || 0;
            const positionValue = shares * currentPrice;
            const positionCostBasis = shares * purchasePrice;
            const dailyChange = shares * (livePrice?.change || 0);

            accountValue += positionValue;
            accountDailyChange += dailyChange;
            accountCostBasis += positionCostBasis;

            return {
              ...position,
              currentPrice,
            };
          }

          if (position.type === "option" && position.ticker) {
            const contracts = position.contracts || 0;
            const premium = position.currentPrice || position.premium || 0;
            const entryPremium = position.premium || 0;
            const positionValue = contracts * premium * 100;
            const positionCostBasis = contracts * (entryPremium || premium) * 100;
            accountValue += positionValue;
            accountCostBasis += positionCostBasis;
            return position;
          }

          return position;
        });

        totalValue += accountValue;
        totalDailyChange += accountDailyChange;
        totalCostBasis += accountCostBasis;

        return {
          ...account,
          _id: account._id.toString(),
          positions: updatedPositions,
          balance: accountValue,
        };
      }

      // No positions - use stored account balance
      accountValue = account.balance || 0;
      totalValue += accountValue;
      totalCostBasis += accountValue;

      return {
        ...account,
        _id: account._id.toString(),
        balance: accountValue,
      };
    });

    const unrealizedPnL = totalValue - totalCostBasis;
    const roiPercent =
      totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0;

    // Calculate totals
    const totalPositions = accounts.reduce(
      (sum, acc) => sum + acc.positions.length,
      0
    );

    const totalRecommendations = accounts.reduce(
      (sum, acc) => sum + acc.recommendations.length,
      0
    );

    // Build portfolio summary (view type)
    const portfolioView: Portfolio = {
      _id: portfolio._id,
      name: portfolio.name,
      accounts: accountsWithLivePrices,
      totalValue,
      dailyChange: totalDailyChange,
      dailyChangePercent: totalValue > 0 ? (totalDailyChange / totalValue) * 100 : 0,
    };

    return NextResponse.json({
      portfolio: portfolioView,
      stats: {
        totalValue,
        dailyChange: totalDailyChange,
        dailyChangePercent:
          totalValue > 0 ? (totalDailyChange / totalValue) * 100 : 0,
        totalCostBasis,
        unrealizedPnL,
        roiPercent,
        accountCount: accounts.length,
        positionCount: totalPositions,
        recommendationCount: totalRecommendations,
      },
    });
  } catch (error) {
    console.error("Failed to fetch dashboard data:", error);
    return NextResponse.json(
      { error: "Failed to fetch dashboard data" },
      { status: 500 }
    );
  }
}
