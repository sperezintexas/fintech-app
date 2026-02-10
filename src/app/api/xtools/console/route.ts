import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { logSecurityEvent } from "@/lib/security";

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
]);

/**
 * Dangerous MongoDB operators that could be used for injection attacks.
 * Block these in user-provided filters to prevent NoSQL injection.
 */
const DANGEROUS_OPERATORS = new Set([
  "$where",      // Allows arbitrary JavaScript execution
  "$function",   // Server-side JavaScript
  "$accumulator",// Server-side JavaScript
  "$expr",       // Can be abused for complex queries
  "$regex",      // Can cause ReDoS attacks
  "$text",       // Text search can be expensive
  "$comment",    // Could leak info via logs
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
  | { op: "updateMany"; collection: string; filter: Record<string, unknown>; update: Record<string, unknown> };

/**
 * Check if an object contains dangerous MongoDB operators (NoSQL injection prevention).
 * Recursively checks nested objects.
 */
function containsDangerousOperators(obj: unknown, path = ""): string | null {
  if (!obj || typeof obj !== "object") return null;

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const result = containsDangerousOperators(obj[i], `${path}[${i}]`);
      if (result) return result;
    }
    return null;
  }

  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Check if key is a dangerous operator
    if (DANGEROUS_OPERATORS.has(key)) {
      return `${path ? path + "." : ""}${key}`;
    }
    // Recursively check nested objects
    if (value && typeof value === "object") {
      const result = containsDangerousOperators(value, `${path ? path + "." : ""}${key}`);
      if (result) return result;
    }
  }
  return null;
}

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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id ?? (session.user as { username?: string }).username ?? "unknown";

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
          "Invalid op. Use: listCollections | find | count | deleteMany | updateMany. Collections are whitelisted.",
      },
      { status: 400 }
    );
  }

  // Security: Check for dangerous operators in filter/update objects
  if ("filter" in body && body.filter) {
    const dangerousOp = containsDangerousOperators(body.filter);
    if (dangerousOp) {
      logSecurityEvent({
        type: "injection_attempt",
        message: `Blocked dangerous operator "${dangerousOp}" in console filter`,
        userId,
        path: "/api/xtools/console",
        metadata: { op: body.op, collection: "collection" in body ? body.collection : undefined },
      });
      return NextResponse.json(
        { error: `Dangerous operator "${dangerousOp}" is not allowed in filters` },
        { status: 400 }
      );
    }
  }

  if ("update" in body && body.update) {
    const dangerousOp = containsDangerousOperators(body.update);
    if (dangerousOp) {
      logSecurityEvent({
        type: "injection_attempt",
        message: `Blocked dangerous operator "${dangerousOp}" in console update`,
        userId,
        path: "/api/xtools/console",
        metadata: { op: body.op, collection: body.collection },
      });
      return NextResponse.json(
        { error: `Dangerous operator "${dangerousOp}" is not allowed in updates` },
        { status: 400 }
      );
    }
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

      // Audit log for destructive operations
      logSecurityEvent({
        type: "suspicious_activity",
        message: `Console deleteMany on ${collection}`,
        userId,
        path: "/api/xtools/console",
        metadata: { collection, filter, op: "deleteMany" },
      });

      const result = await coll.deleteMany(filter, { maxTimeMS: MAX_TIME_MS });
      return NextResponse.json({ ok: true, deleted: result.deletedCount });
    }

    if (body.op === "updateMany") {
      const filter = normalizeFilter(body.filter);
      const update = body.update as Record<string, unknown>;

      // Audit log for destructive operations
      logSecurityEvent({
        type: "suspicious_activity",
        message: `Console updateMany on ${collection}`,
        userId,
        path: "/api/xtools/console",
        metadata: { collection, filter, update, op: "updateMany" },
      });

      const result = await coll.updateMany(filter, update, { maxTimeMS: MAX_TIME_MS });
      return NextResponse.json({
        ok: true,
        matched: result.matchedCount,
        modified: result.modifiedCount,
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
