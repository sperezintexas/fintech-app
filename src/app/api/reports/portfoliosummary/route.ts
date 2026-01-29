import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getMultipleTickerPrices } from "@/lib/yahoo";
import type { Account, Position } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type PortfolioSummaryReport = {
  _id: string;
  accountId?: string; // If accountId provided, single account; otherwise all accounts
  reportDate: string; // ISO date string (YYYY-MM-DD)
  reportDateTime: string; // Full ISO datetime
  title: string; // "Portfolio Update — January 28, 2026"
  accounts: Array<{
    name: string;
    accountId?: string;
    broker?: string;
    riskLevel: string;
    strategy: string;
    totalValue: number;
    dailyChange: number;
    dailyChangePercent: number;
    weekChange?: number;
    weekChangePercent?: number;
    positions: Array<{
      symbol: string;
      shares?: number;
      avgCost: number;
      currentPrice: number;
      dailyChange: number;
      dailyChangePercent: number;
      unrealizedPnL: number;
      unrealizedPnLPercent: number;
    }>;
    optionsActivity?: string;
    recommendation?: string;
  }>;
  marketSnapshot: {
    SPY: { price: number; change: number; changePercent: number };
    QQQ: { price: number; change: number; changePercent: number };
    VIX: { price: number; level: "low" | "moderate" | "elevated" };
    TSLA: { price: number; change: number; changePercent: number };
  };
  goalsProgress: {
    merrill: {
      target: number; // $1M
      targetDate: string; // "2030"
      currentValue: number;
      progressPercent: number;
      cagrNeeded: number; // e.g., 18-25%
    };
    fidelity: {
      targetDate: string; // "end-2026"
      currentValue: number;
      trajectory: "strong" | "moderate" | "weak";
    };
  };
  createdAt: string;
};

// POST - Generate PortfolioSummary report
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accountId } = body; // Optional: if provided, only that account; otherwise all accounts

    const db = await getDb();

    // Fetch accounts (single or all)
    const query = accountId ? { _id: new ObjectId(accountId) } : {};
    type AccountDoc = Omit<Account, "_id"> & { _id: ObjectId };
    const accounts = await db.collection<AccountDoc>("accounts").find(query).toArray();

    if (accounts.length === 0) {
      return NextResponse.json({ error: "No accounts found" }, { status: 404 });
    }

    // Get all positions across accounts
    const allPositions: Array<Position & { accountName: string; accountId: string }> = [];
    for (const account of accounts) {
      for (const pos of account.positions || []) {
        allPositions.push({
          ...pos,
          accountName: account.name,
          accountId: account._id.toString(),
        });
      }
    }

    // Collect unique tickers
    const tickers = new Set<string>();
    for (const pos of allPositions) {
      if (pos.ticker) tickers.add(pos.ticker);
    }
    tickers.add("SPY");
    tickers.add("QQQ");
    tickers.add("^VIX");
    tickers.add("TSLA");

    // Fetch live prices
    const prices = await getMultipleTickerPrices(Array.from(tickers));

    // Calculate account summaries
    const accountSummaries = accounts.map((account) => {
      const accountPositions = allPositions.filter(
        (p) => p.accountId === account._id.toString()
      );
      let accountValue = 0;
      let accountDailyChange = 0;
      let accountWeekChange = 0; // Placeholder - would need historical data

      // Process stock positions
      const positionDetails = accountPositions
        .filter((p) => p.type === "stock" && p.ticker)
        .map((pos) => {
          const livePrice = prices.get(pos.ticker!);
          const currentPrice = livePrice?.price || pos.currentPrice || 0;
          const shares = pos.shares || 0;
          const avgCost = pos.purchasePrice || 0;
          const dailyChange = shares * (livePrice?.change || 0);
          const positionValue = shares * currentPrice;
          const costBasis = shares * avgCost;
          const unrealizedPnL = positionValue - costBasis;
          const unrealizedPnLPercent = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;

          accountValue += positionValue;
          accountDailyChange += dailyChange;

          return {
            symbol: pos.ticker!,
            shares,
            avgCost,
            currentPrice,
            dailyChange: livePrice?.change || 0,
            dailyChangePercent: livePrice?.changePercent || 0,
            unrealizedPnL,
            unrealizedPnLPercent,
          };
        });

      // Process option positions
      const optionPositions = accountPositions.filter((p) => p.type === "option");
      for (const opt of optionPositions) {
        const contracts = opt.contracts || 0;
        const premium = opt.currentPrice || opt.premium || 0;
        const _entryPremium = opt.premium || premium;
        const positionValue = contracts * premium * 100;
        accountValue += positionValue;
        // Options daily change is harder to calculate without greeks, so we skip it for now
      }

      // Process cash positions
      const cashPositions = accountPositions.filter((p) => p.type === "cash");
      for (const cash of cashPositions) {
        accountValue += cash.amount || 0;
      }

      // If no positions, use account balance
      if (accountPositions.length === 0) {
        accountValue = account.balance || 0;
      }

      // Calculate week change (placeholder - would need historical data)
      accountWeekChange = accountDailyChange * 5; // Rough estimate

      return {
        name: account.name,
        accountId: account._id.toString(), // Store for matching
        broker: account.name.includes("Merrill") ? "Merrill" : account.name.includes("Fidelity") ? "Fidelity" : undefined,
        riskLevel: account.riskLevel || "medium",
        strategy: account.strategy || "Core",
        totalValue: accountValue,
        dailyChange: accountDailyChange,
        dailyChangePercent: accountValue > 0 ? (accountDailyChange / accountValue) * 100 : 0,
        weekChange: accountWeekChange,
        weekChangePercent: accountValue > 0 ? (accountWeekChange / accountValue) * 100 : 0,
        positions: positionDetails,
        optionsActivity: "", // Will be filled below
        recommendation: "", // Will be filled below
      };
    });

    // Generate options activity and recommendations per account
    const accountById = new Map(accounts.map((a) => [a._id.toString(), a]));
    for (const summary of accountSummaries) {
      const account = summary.accountId
        ? accountById.get(summary.accountId)
        : accounts.find((a) => a.name === summary.name);
      if (!account) continue;

      const tslaPos = summary.positions.find((p) => p.symbol === "TSLA");
      const options = (account.positions || []).filter((p) => p.type === "option");

      // Build options activity string
      if (tslaPos && tslaPos.shares >= 475) {
        // Covered call example - check if there are actual CC positions
        const ccOptions = options.filter(
          (opt) =>
            (opt.ticker || "").toUpperCase().includes("TSLA") &&
            opt.optionType === "call"
        );
        if (ccOptions.length > 0) {
          const cc = ccOptions[0];
          const strike = cc.strike ?? 0;
          const exp = cc.expiration ?? "";
          const premium = cc.premium ?? 0;
          summary.optionsActivity = `${tslaPos.shares} TSLA shares | ${cc.contracts || 0} ${strike} ${exp} CC collecting $${(premium * (cc.contracts || 0) * 100).toFixed(0)} premium`;
        } else {
          summary.optionsActivity = `${tslaPos.shares} TSLA shares | No active covered calls`;
        }
      } else if (options.length > 0) {
        const optionDetails = options
          .slice(0, 3)
          .map((opt) => {
            const symbol = opt.ticker || "Unknown";
            const contracts = opt.contracts || 0;
            return `${symbol} x${contracts}`;
          })
          .join(" | ");
        summary.optionsActivity = `${options.length} option position(s): ${optionDetails}`;
      } else {
        summary.optionsActivity = "No active options";
      }

      // Generate recommendation based on risk level
      const riskLevel = account.riskLevel || "medium";
      if (riskLevel === "low" || riskLevel === "medium") {
        const tslaPrice = tslaPos?.currentPrice || 0;
        summary.recommendation = tslaPos
          ? `Hold core TSLA. Consider rolling CC up/out if TSLA >$${Math.round(tslaPrice * 1.05)} | Sell CSP ${Math.round(tslaPrice * 0.9)}-${Math.round(tslaPrice * 0.95)} on dips`
          : "Maintain balanced approach";
      } else {
        const tslaPrice = tslaPos?.currentPrice || 0;
        summary.recommendation = `Add OTM TSLA calls on pullback < $${Math.round(tslaPrice * 0.95)} | Consider straddle ahead of earnings`;
      }
    }

    // Market snapshot
    const spyData = prices.get("SPY");
    const qqqData = prices.get("QQQ");
    const vixData = prices.get("^VIX");
    const tslaData = prices.get("TSLA");

    const vixLevel = vixData && vixData.price
      ? vixData.price < 15
        ? "low"
        : vixData.price < 25
        ? "moderate"
        : "elevated"
      : "moderate";

    // Goals progress
    const merrillAccount = accountSummaries.find((a) => a.name.includes("Merrill") || a.broker === "Merrill");
    const fidelityAccount = accountSummaries.find((a) => a.name.includes("Fidelity") || a.broker === "Fidelity");

    const merrillValue = merrillAccount?.totalValue || 0;
    const merrillTarget = 1_000_000;
    const yearsTo2030 = (new Date("2030-01-01").getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000);
    const cagrNeeded = merrillValue > 0 && yearsTo2030 > 0
      ? ((merrillTarget / merrillValue) ** (1 / yearsTo2030) - 1) * 100
      : 0;

    const fidelityValue = fidelityAccount?.totalValue || 0;
    const fidelityTrajectory: "strong" | "moderate" | "weak" =
      fidelityAccount && fidelityAccount.dailyChangePercent > 1 ? "strong" : fidelityAccount && fidelityAccount.dailyChangePercent > 0 ? "moderate" : "weak";

    const now = new Date();
    const reportDate = now.toISOString().split("T")[0];
    const reportDateTime = now.toISOString();
    const dateFormatted = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

    const report: Omit<PortfolioSummaryReport, "_id"> = {
      accountId: accountId || undefined,
      reportDate,
      reportDateTime,
      title: `Portfolio Update — ${dateFormatted}`,
      accounts: accountSummaries,
      marketSnapshot: {
        SPY: {
          price: spyData?.price || 0,
          change: spyData?.change || 0,
          changePercent: spyData?.changePercent || 0,
        },
        QQQ: {
          price: qqqData?.price || 0,
          change: qqqData?.change || 0,
          changePercent: qqqData?.changePercent || 0,
        },
        VIX: {
          price: vixData?.price || 0,
          level: vixLevel,
        },
        TSLA: {
          price: tslaData?.price || 0,
          change: tslaData?.change || 0,
          changePercent: tslaData?.changePercent || 0,
        },
      },
      goalsProgress: {
        merrill: {
          target: merrillTarget,
          targetDate: "2030",
          currentValue: merrillValue,
          progressPercent: (merrillValue / merrillTarget) * 100,
          cagrNeeded: Math.max(0, cagrNeeded),
        },
        fidelity: {
          targetDate: "end-2026",
          currentValue: fidelityValue,
          trajectory: fidelityTrajectory,
        },
      },
      createdAt: reportDateTime,
    };

    // Save report
    const result = await db.collection("portfolioSummaryReports").insertOne(report as Record<string, unknown>);

    return NextResponse.json({
      success: true,
      report: {
        ...report,
        _id: result.insertedId.toString(),
      },
    });
  } catch (error) {
    console.error("Failed to generate PortfolioSummary report:", error);
    return NextResponse.json(
      { error: "Failed to generate PortfolioSummary report" },
      { status: 500 }
    );
  }
}

// GET - Fetch PortfolioSummary reports
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const accountId = searchParams.get("accountId");
    const limit = parseInt(searchParams.get("limit") || "10");

    const db = await getDb();

    // If ID provided, fetch single report
    if (id) {
      const report = await db
        .collection("portfolioSummaryReports")
        .findOne({ _id: new ObjectId(id) });

      if (!report) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }

      return NextResponse.json({
        ...report,
        _id: (report as { _id: ObjectId })._id.toString(),
      });
    }

    // Otherwise, fetch multiple reports
    const query: Record<string, unknown> = {};
    if (accountId) query.accountId = accountId;

    const reports = await db
      .collection("portfolioSummaryReports")
      .find(query)
      .sort({ reportDateTime: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(
      reports.map((r) => ({
        ...r,
        _id: (r as { _id: ObjectId })._id.toString(),
      }))
    );
  } catch (error) {
    console.error("Failed to fetch PortfolioSummary reports:", error);
    return NextResponse.json(
      { error: "Failed to fetch PortfolioSummary reports" },
      { status: 500 }
    );
  }
}
