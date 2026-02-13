import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Liveness probe: returns 200 immediately with no DB/scheduler calls.
 * Use this for App Runner (and similar) health checks so deployment
 * succeeds even when MongoDB or Agenda are slow or unreachable.
 * Full checks remain at GET /api/health.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
}
