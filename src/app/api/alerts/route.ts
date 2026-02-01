import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import type { WatchlistAlert } from "@/types/portfolio";

export const dynamic = "force-dynamic";

// GET /api/alerts - Get all alerts or filter
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const unacknowledged = searchParams.get("unacknowledged") === "true";
    const severity = searchParams.get("severity");
    const type = searchParams.get("type"); // job type: daily-analysis, option-scanner, covered-call, protective-put
    const symbol = searchParams.get("symbol");
    const dateFrom = searchParams.get("dateFrom"); // YYYY-MM-DD
    const dateTo = searchParams.get("dateTo"); // YYYY-MM-DD
    const limit = parseInt(searchParams.get("limit") || "50");

    const db = await getDb();

    // Build query
    const query: Record<string, unknown> = {};
    if (accountId) query.accountId = accountId;
    if (unacknowledged) query.acknowledged = false;
    if (severity) query.severity = severity;
    if (type) query.type = type;
    if (symbol) query.symbol = new RegExp(symbol, "i");

    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) (query.createdAt as Record<string, string>).$gte = `${dateFrom}T00:00:00.000Z`;
      if (dateTo) (query.createdAt as Record<string, string>).$lte = `${dateTo}T23:59:59.999Z`;
    }

    const alerts = await db
      .collection("alerts")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    // Transform MongoDB _id to string
    const formattedAlerts = alerts.map((alert) => ({
      ...alert,
      _id: alert._id.toString(),
    }));

    return NextResponse.json(formattedAlerts);
  } catch (error) {
    console.error("Failed to fetch alerts:", error);
    return NextResponse.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}

// POST /api/alerts - Create a new alert (typically called by analysis job)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      watchlistItemId,
      accountId,
      symbol,
      recommendation,
      severity,
      reason,
      details,
      riskWarning,
      suggestedActions,
    } = body;

    // Validate required fields
    if (!watchlistItemId || !accountId || !symbol || !recommendation || !severity || !reason) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const db = await getDb();

    const newAlert: Omit<WatchlistAlert, "_id"> = {
      watchlistItemId,
      accountId,
      symbol,
      recommendation,
      severity,
      reason,
      details: details || {},
      riskWarning,
      suggestedActions: suggestedActions || [],
      createdAt: new Date().toISOString(),
      acknowledged: false,
    };

    const result = await db.collection("alerts").insertOne(newAlert);

    return NextResponse.json(
      {
        ...newAlert,
        _id: result.insertedId.toString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create alert:", error);
    return NextResponse.json(
      { error: "Failed to create alert" },
      { status: 500 }
    );
  }
}

// DELETE /api/alerts - Clear all alerts (optionally filtered by accountId)
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const query: Record<string, unknown> = {};
    if (accountId) query.accountId = accountId;
    const db = await getDb();
    const result = await db.collection("alerts").deleteMany(query);
    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Failed to clear alerts:", error);
    return NextResponse.json(
      { error: "Failed to clear alerts" },
      { status: 500 }
    );
  }
}
