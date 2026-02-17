import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseNaturalLanguageOrder } from "@/lib/xai-grok";
import { buildOrderFromParsed } from "@/lib/strategy-builder";

export const dynamic = "force-dynamic";

const postBodySchema = z.object({
  nl: z.string().min(1).max(2000).trim(),
});

export type NlOrderParseResponse =
  | { ok: true; order: import("@/types/order").ParsedOrder; prefill: import("@/lib/strategy-builder").OrderPrefill }
  | { ok: false; error: { code: string; message: string } };

export async function POST(request: NextRequest): Promise<NextResponse<NlOrderParseResponse>> {
  try {
    const raw = await request.json();
    const parsed = postBodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { ok: false, error: { code: "VALIDATION_FAILED", message: parsed.error.message } },
        { status: 400 }
      );
    }

    const result = await parseNaturalLanguageOrder(parsed.data.nl);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: { code: result.error.code, message: result.error.message } },
        { status: 200 }
      );
    }

    const prefill = buildOrderFromParsed(result.order);
    return NextResponse.json({
      ok: true,
      order: result.order,
      prefill,
    });
  } catch (e) {
    console.error("nl-order-parse error:", e);
    return NextResponse.json(
      { ok: false, error: { code: "GROK_ERROR", message: "Parse request failed." } },
      { status: 500 }
    );
  }
}
