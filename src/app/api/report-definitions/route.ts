import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import type { ReportDefinition, ReportDefinitionType, ReportTemplateId } from "@/types/portfolio";

export const dynamic = "force-dynamic";

type ReportDefinitionDoc = Omit<ReportDefinition, "_id"> & { _id: ObjectId };

// GET /api/report-definitions?accountId=...
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }

    const db = await getDb();
    const defs = await db
      .collection<ReportDefinitionDoc>("reportDefinitions")
      .find({ accountId })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json(
      defs.map((d) => ({
        ...d,
        _id: d._id.toString(),
      }))
    );
  } catch (error) {
    console.error("Failed to fetch report definitions:", error);
    return NextResponse.json({ error: "Failed to fetch report definitions" }, { status: 500 });
  }
}

// POST /api/report-definitions
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      accountId?: string;
      name?: string;
      description?: string;
      type?: ReportDefinitionType;
      templateId?: ReportTemplateId;
      customSlackTemplate?: string;
    };

    const accountId = body.accountId;
    const name = (body.name ?? "").trim();
    const description = (body.description ?? "").trim();
    const type: ReportDefinitionType = body.type ?? "smartxai";
    const templateId = body.templateId ?? "concise";
    const customSlackTemplate = body.customSlackTemplate?.trim() || undefined;

    if (!accountId) {
      return NextResponse.json({ error: "accountId is required" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const db = await getDb();
    const account = await db.collection("accounts").findOne({ _id: new ObjectId(accountId) });
    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const doc: Omit<ReportDefinitionDoc, "_id"> = {
      accountId,
      name,
      description,
      type,
      templateId,
      ...(customSlackTemplate !== undefined && { customSlackTemplate }),
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection<ReportDefinitionDoc>("reportDefinitions").insertOne(doc as ReportDefinitionDoc);

    return NextResponse.json(
      {
        ...doc,
        _id: result.insertedId.toString(),
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create report definition:", error);
    return NextResponse.json({ error: "Failed to create report definition" }, { status: 500 });
  }
}
