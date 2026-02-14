import { NextRequest, NextResponse } from "next/server";
import { getSymbolLogoUrl } from "@/lib/symbol-logo-cache";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ symbol: string }> };

/** GET /api/ticker/[symbol]/logo - Redirect to company logo. Uses symbols cache (memory + DB) to avoid Yahoo lookup on every request. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { symbol } = await params;
    const logoUrl = await getSymbolLogoUrl(symbol ?? "");
    if (!logoUrl) {
      return NextResponse.json({ error: "No logo URL for symbol" }, { status: 404 });
    }
    return NextResponse.redirect(logoUrl, 302);
  } catch {
    return NextResponse.json({ error: "Failed to resolve logo" }, { status: 404 });
  }
}
