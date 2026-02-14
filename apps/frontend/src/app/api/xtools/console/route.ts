import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { getSessionFromRequest } from "@/lib/require-session";
import { ObjectId } from "mongodb";

export const dynamic = "force-dynamic";

/** Allowed collection names for queries and cleanup (no system collections). */
const ALLOWED_COLLECTIONS = new Set([
  "accounts",
  "activities",
  "alerts",
  "alertConfigs",
  "alertPreferences",
  "scheduledAlerts",
  "watchlist",
  "watchlists",
  "reportTypes",
  "reportJobs",
  "pushSubscriptions",
  "smartXAIReports",
  "portfolioSummaryReports",
  "coveredCallRecommendations",
  "protectivePutRecommendations",
  "optionRecommendations",
  "straddleStrangleRecommendations",
  "auth_users",
  "portfolios",
  "userSettings",
  "symbols",
]);

const MAX_FIND_LIMIT = 500;
/** Max time per operation so we don't hold locks. Auto-commit only (no transactions). */
const MAX_TIME_MS = 15_000;
/** Read concern to avoid holding locks (local = no snapshot, minimal impact). */
const READ_OPTIONS = { readConcern: { level: "local" as const }, maxTimeMS: MAX_TIME_MS };

type ConsoleOp =
  | { op: "listCollections" }
  | { op: "find"; collection: string; filter?: Record<string, unknown>; limit?: number }
  | { op: "count"; collection: string; filter?: Record<string, unknown> }
  | { op: "deleteMany"; collection: string; filter: Record<string, unknown> }
  | { op: "updateMany"; collection: string; filter: Record<string, unknown>; update: Record<string, unknown> }
  | { op: "insertOne"; collection: string; document: Record<string, unknown> };

function isConsoleOp(body: unknown): body is ConsoleOp {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  const op = o.op;
  if (op === "listCollections") return true;
  if (op === "find") {
    return typeof o.collection === "string" && ALLOWED_COLLECTIONS.has(o.collection);
  }
  if (op === "count") {
    return typeof o.collection === "string" && ALLOWED_COLLECTIONS.has(o.collection);
  }
  if (op === "deleteMany") {
    return (
      typeof o.collection === "string" &&
      ALLOWED_COLLECTIONS.has(o.collection) &&
      o.filter !== undefined &&
      typeof o.filter === "object" &&
      o.filter !== null
    );
  }
  if (op === "updateMany") {
    return (
      typeof o.collection === "string" &&
      ALLOWED_COLLECTIONS.has(o.collection) &&
      o.filter !== undefined &&
      typeof o.filter === "object" &&
      o.filter !== null &&
      o.update !== undefined &&
      typeof o.update === "object" &&
      o.update !== null
    );
  }
  if (op === "insertOne") {
    return (
      typeof o.collection === "string" &&
      ALLOWED_COLLECTIONS.has(o.collection) &&
      o.document !== undefined &&
      typeof o.document === "object" &&
      o.document !== null
    );
  }
  return false;
}

/** Convert string _id in filter to ObjectId where applicable. */
function normalizeFilter(filter: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filter)) {
    if (k === "_id" && typeof v === "string") {
      try {
        out[k] = new ObjectId(v);
      } catch {
        out[k] = v;
      }
    } else if (v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof ObjectId)) {
      out[k] = normalizeFilter(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  const session = await getSessionFromRequest(request);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isConsoleOp(body)) {
    return NextResponse.json(
      {
        error:
          "Invalid op. Use: listCollections | find | count | deleteMany | updateMany | insertOne. Collections are whitelisted.",
      },
      { status: 400 }
    );
  }

  try {
    const db = await getDb();

    if (body.op === "listCollections") {
      const cols = await db
        .listCollections({}, { maxTimeMS: MAX_TIME_MS })
        .toArray();
      const names = cols.map((c) => c.name).sort();
      return NextResponse.json({ ok: true, collections: names });
    }

    const collection = body.collection;
    const coll = db.collection(collection);

    if (body.op === "find") {
      const filter = normalizeFilter((body.filter as Record<string, unknown>) ?? {});
      const limit = Math.min(Math.max(0, Number(body.limit) || 50), MAX_FIND_LIMIT);
      const docs = await coll
        .find(filter, READ_OPTIONS)
        .limit(limit)
        .toArray();
      const serialized = docs.map((d) => {
        const { _id, ...rest } = d as { _id?: unknown; [k: string]: unknown };
        return { _id: _id instanceof ObjectId ? _id.toString() : _id, ...rest };
      });
      return NextResponse.json({ ok: true, count: serialized.length, data: serialized });
    }

    if (body.op === "count") {
      const filter = normalizeFilter((body.filter as Record<string, unknown>) ?? {});
      const n = await coll.countDocuments(filter, READ_OPTIONS);
      return NextResponse.json({ ok: true, count: n });
    }

    if (body.op === "deleteMany") {
      const filter = normalizeFilter(body.filter);
      const result = await coll.deleteMany(filter, { maxTimeMS: MAX_TIME_MS });
      return NextResponse.json({ ok: true, deleted: result.deletedCount });
    }

    if (body.op === "updateMany") {
      const filter = normalizeFilter(body.filter);
      const update = body.update as Record<string, unknown>;
      const result = await coll.updateMany(filter, update, { maxTimeMS: MAX_TIME_MS });
      return NextResponse.json({
        ok: true,
        matched: result.matchedCount,
        modified: result.modifiedCount,
      });
    }

    if (body.op === "insertOne") {
      const doc = body.document as Record<string, unknown>;
      if (doc.createdAt === undefined) (doc as Record<string, unknown>).createdAt = new Date();
      if (doc.updatedAt === undefined) (doc as Record<string, unknown>).updatedAt = new Date();
      const result = await coll.insertOne(doc as Record<string, unknown>, { maxTimeMS: MAX_TIME_MS });
      return NextResponse.json({
        ok: true,
        insertedId: result.insertedId.toString(),
      });
    }

    return NextResponse.json({ error: "Unknown op" }, { status: 400 });
  } catch (err) {
    console.error("[xtools/console]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Console execution failed" },
      { status: 500 }
    );
  }
}
