import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getMultipleTickerPrices } from "@/lib/polygon";
import type { Account, Portfolio } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// GET /api/dashboard - Get dashboard summary with live prices
export async function GET() {
  try {
    // Get all accounts from MongoDB
    const db = await getDb();
    const accounts = (await db.collection("accounts").find({}).toArray()) as Account[];

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

    const accountsWithLivePrices: Account[] = accounts.map((account) => {
      let accountValue = 0;
      let accountDailyChange = 0;

      // If account has positions, calculate value from positions
      if (account.positions && account.positions.length > 0) {
        const updatedPositions = account.positions.map((position) => {
          if (position.type === "cash") {
            accountValue += position.amount || 0;
            return position;
          }

          if (position.type === "stock" && position.ticker) {
            const livePrice = prices.get(position.ticker);
            const currentPrice = livePrice?.price || position.currentPrice || 0;
            const shares = position.shares || 0;
            const positionValue = shares * currentPrice;
            const dailyChange = shares * (livePrice?.change || 0);

            accountValue += positionValue;
            accountDailyChange += dailyChange;

            return {
              ...position,
              currentPrice,
            };
          }

          if (position.type === "option" && position.ticker) {
            // Options use contract multiplier of 100
            const contracts = position.contracts || 0;
            const premium = position.currentPrice || position.premium || 0;
            const positionValue = contracts * premium * 100;
            accountValue += positionValue;

            return position;
          }

          return position;
        });

        totalValue += accountValue;
        totalDailyChange += accountDailyChange;

        return {
          ...account,
          positions: updatedPositions,
          balance: accountValue,
        };
      }

      // No positions - use stored account balance
      accountValue = account.balance || 0;
      totalValue += accountValue;

      return {
        ...account,
        balance: accountValue,
      };
    });

    // Calculate totals
    const totalPositions = accounts.reduce(
      (sum, acc) => sum + acc.positions.length,
      0
    );

    const totalRecommendations = accounts.reduce(
      (sum, acc) => sum + acc.recommendations.length,
      0
    );

    // Build portfolio summary
    const portfolio: Portfolio = {
      _id: "main",
      name: "Main Portfolio",
      accounts: accountsWithLivePrices,
      totalValue,
      dailyChange: totalDailyChange,
      dailyChangePercent: totalValue > 0 ? (totalDailyChange / totalValue) * 100 : 0,
    };

    return NextResponse.json({
      portfolio,
      stats: {
        totalValue,
        dailyChange: totalDailyChange,
        dailyChangePercent:
          totalValue > 0 ? (totalDailyChange / totalValue) * 100 : 0,
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
