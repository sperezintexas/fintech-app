import { NextRequest, NextResponse } from "next/server";
import { getBuiltinLogoFile, readBrokerLogoFromDisk } from "@/lib/broker-logo-disk";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ name: string }> };

/** GET /api/brokers/logo/[name] - Serve built-in broker logo by name (merrill | fidelity) */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { name } = await params;
    const file = getBuiltinLogoFile(name ?? undefined);
    if (!file) {
      return NextResponse.json({ error: "Unknown broker name" }, { status: 404 });
    }
    const buffer = await readBrokerLogoFromDisk(file);
    if (!buffer) {
      return NextResponse.json({ error: "Logo not found" }, { status: 404 });
    }
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "Logo not found" }, { status: 404 });
  }
}
