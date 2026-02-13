import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { BUILTIN_BROKER_LOGO_FILES, readBrokerLogoFromDisk } from "@/lib/broker-logo-disk";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/brokers/[id]/logo - Serve broker logo from disk by name (Merrill/Fidelity) or 404 for color fallback in UI */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid broker id" }, { status: 400 });
    }
    const db = await getDb();
    const brokerId = new ObjectId(id);
    const broker = await db.collection("brokers").findOne(
      { _id: brokerId },
      { projection: { name: 1 } }
    );
    if (!broker) {
      return NextResponse.json({ error: "Broker not found" }, { status: 404 });
    }
    const name = (broker as { name?: string }).name?.trim().toLowerCase();
    const builtinFile = name ? BUILTIN_BROKER_LOGO_FILES[name] : undefined;
    if (builtinFile) {
      const buffer = await readBrokerLogoFromDisk(builtinFile);
      if (buffer) {
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=86400",
          },
        });
      }
    }
    return NextResponse.json({ error: "No logo" }, { status: 404 });
  } catch (error) {
    console.error("Failed to serve broker logo:", error);
    return NextResponse.json(
      { error: "Failed to serve logo" },
      { status: 500 }
    );
  }
}
