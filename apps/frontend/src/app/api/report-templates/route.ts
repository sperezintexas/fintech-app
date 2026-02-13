import { NextRequest, NextResponse } from "next/server";
import { getReportTemplates, setReportTemplates } from "@/lib/templates-store";
import type { ReportTemplate } from "@/types/portfolio";

export const dynamic = "force-dynamic";

/** GET - Return current report templates (DB override or file default) */
export async function GET() {
  try {
    const templates = await getReportTemplates();
    return NextResponse.json({ templates });
  } catch (error) {
    console.error("Failed to fetch report templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch report templates" },
      { status: 500 }
    );
  }
}

/** PUT - Save report templates to DB */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const templates = body.templates as ReportTemplate[];

    if (!Array.isArray(templates)) {
      return NextResponse.json(
        { error: "templates must be an array" },
        { status: 400 }
      );
    }

    // Basic validation
    for (const t of templates) {
      if (!t?.id || typeof t.name !== "string") {
        return NextResponse.json(
          { error: `Invalid template: each must have id and name` },
          { status: 400 }
        );
      }
    }

    await setReportTemplates(templates);
    return NextResponse.json({ success: true, templates });
  } catch (error) {
    console.error("Failed to save report templates:", error);
    return NextResponse.json(
      { error: "Failed to save report templates" },
      { status: 500 }
    );
  }
}
