import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/lib/mongodb";
import { ensureDefaultReportTypes } from "@/lib/report-types-seed";
import { validateJobConfig } from "@/lib/job-config-schemas";
import {
  REPORT_HANDLER_KEYS,
  type ReportHandlerKey,
} from "@/lib/report-type-constants";
import type { AlertDeliveryChannel } from "@/types/portfolio";
import type { ReportTemplateId } from "@/types/portfolio";

export const dynamic = "force-dynamic";

export { REPORT_HANDLER_KEYS, type ReportHandlerKey };

/** Default delivery channels: Slack or X (twitter) only. */
const DEFAULT_DELIVERY_CHANNELS: AlertDeliveryChannel[] = ["slack", "twitter"];

const VALID_TEMPLATE_IDS = ["concise", "detailed", "actionable", "risk-aware"] as const;

export type ReportType = {
  _id: string;
  /** Unique identifier (used in report definitions). Can match handlerKey or be custom e.g. smartxai-weekly */
  id: string;
  /** Backend handler that generates this report */
  handlerKey: ReportHandlerKey;
  name: string;
  description: string;
  supportsPortfolio: boolean;
  supportsAccount: boolean;
  order: number;
  enabled: boolean;
  /** Type-specific default config (used when creating new jobs) */
  defaultConfig?: Record<string, unknown>;
  /** Default delivery channels (used when creating new jobs) */
  defaultDeliveryChannels?: AlertDeliveryChannel[];
  /** Message template for report output. Default: concise */
  defaultTemplateId?: ReportTemplateId;
  createdAt: string;
  updatedAt: string;
};

type ReportTypeDoc = Omit<ReportType, "_id"> & { _id: ObjectId };

const _DEFAULT_REPORT_TYPES: Omit<ReportType, "_id" | "createdAt" | "updatedAt">[] = [
  { id: "smartxai", handlerKey: "smartxai", name: "SmartXAI Report", description: "AI-powered position analysis and sentiment", supportsPortfolio: false, supportsAccount: true, order: 0, enabled: true },
  { id: "portfoliosummary", handlerKey: "portfoliosummary", name: "Portfolio Summary", description: "Multi-account portfolio overview", supportsPortfolio: true, supportsAccount: true, order: 1, enabled: true },
  { id: "watchlistreport", handlerKey: "watchlistreport", name: "Watchlist Report", description: "Market snapshot + rationale per item; one post per watchlist to configured channels; runs daily analysis and creates alerts", supportsPortfolio: true, supportsAccount: true, order: 2, enabled: true },
  { id: "cleanup", handlerKey: "cleanup", name: "Data Cleanup", description: "Delete old reports and alerts (30+ days)", supportsPortfolio: true, supportsAccount: true, order: 3, enabled: true },
  { id: "unifiedOptionsScanner", handlerKey: "unifiedOptionsScanner", name: "Unified Options Scanner", description: "Runs Option, Covered Call, Protective Put, and Straddle/Strangle scanners in one job", supportsPortfolio: false, supportsAccount: true, order: 4, enabled: true },
  { id: "deliverAlerts", handlerKey: "deliverAlerts", name: "Deliver Alerts", description: "Sends pending alerts to Slack/X per AlertConfig", supportsPortfolio: true, supportsAccount: true, order: 5, enabled: true },
  { id: "riskScanner", handlerKey: "riskScanner", name: "Risk Scanner", description: "Portfolio risk analysis with Grok; creates alerts when risk is high", supportsPortfolio: true, supportsAccount: true, order: 6, enabled: true },
];

// GET /api/report-types?all=true (all=true returns disabled types too, for admin)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeDisabled = searchParams.get("all") === "true";

    const db = await getDb();
    await ensureDefaultReportTypes(db);

    const filter = includeDisabled ? {} : { enabled: true };
    const types = await db
      .collection<ReportTypeDoc>("reportTypes")
      .find(filter)
      .sort({ order: 1, name: 1 })
      .toArray();

    return NextResponse.json(
      types.map((t) => ({
        ...t,
        _id: t._id.toString(),
      }))
    );
  } catch (error) {
    console.error("Failed to fetch report types:", error);
    return NextResponse.json({ error: "Failed to fetch report types" }, { status: 500 });
  }
}

function validateDefaultConfig(handlerKey: string, config: unknown): Record<string, unknown> | undefined {
  if (config == null || (typeof config === "object" && Object.keys(config as object).length === 0)) {
    return undefined;
  }
  try {
    return validateJobConfig("", handlerKey, config) as Record<string, unknown>;
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Invalid default config");
  }
}

function validateChannels(channels: unknown): AlertDeliveryChannel[] | undefined {
  if (!Array.isArray(channels) || channels.length === 0) return undefined;
  const valid = channels.filter((c) => DEFAULT_DELIVERY_CHANNELS.includes(c as AlertDeliveryChannel));
  return valid.length > 0 ? valid : undefined;
}

function validateTemplateId(templateId: unknown): ReportTemplateId | undefined {
  if (templateId == null || templateId === "") return undefined;
  return VALID_TEMPLATE_IDS.includes(templateId as ReportTemplateId) ? (templateId as ReportTemplateId) : undefined;
}

// POST /api/report-types
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      id?: string;
      handlerKey?: string;
      name?: string;
      description?: string;
      supportsPortfolio?: boolean;
      supportsAccount?: boolean;
      order?: number;
      defaultConfig?: Record<string, unknown>;
      defaultDeliveryChannels?: AlertDeliveryChannel[];
      defaultTemplateId?: ReportTemplateId;
    };

    const id = (body.id ?? "").trim().toLowerCase().replace(/\s+/g, "-");
    const handlerKey = body.handlerKey as ReportHandlerKey | undefined;
    const name = (body.name ?? "").trim();
    const description = (body.description ?? "").trim();
    const supportsPortfolio = body.supportsPortfolio ?? false;
    const supportsAccount = body.supportsAccount ?? true;
    const order = body.order ?? 100;

    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    if (!REPORT_HANDLER_KEYS.includes(handlerKey as ReportHandlerKey)) {
      return NextResponse.json(
        { error: `handlerKey must be one of: ${REPORT_HANDLER_KEYS.join(", ")}` },
        { status: 400 }
      );
    }
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    let defaultConfig: Record<string, unknown> | undefined;
    if (body.defaultConfig !== undefined) {
      try {
        defaultConfig = validateDefaultConfig(handlerKey ?? "", body.defaultConfig);
      } catch (err) {
        return NextResponse.json(
          { error: err instanceof Error ? err.message : "Invalid default config" },
          { status: 400 }
        );
      }
    }
    const defaultDeliveryChannels = validateChannels(body.defaultDeliveryChannels);
    const defaultTemplateId = validateTemplateId(body.defaultTemplateId);

    const db = await getDb();
    await ensureDefaultReportTypes(db);

    const coll = db.collection<ReportTypeDoc>("reportTypes");
    const existing = await coll.findOne({ id });
    if (existing) {
      return NextResponse.json({ error: "A report type with this id already exists" }, { status: 400 });
    }

    const now = new Date().toISOString();
    const doc: ReportTypeDoc = {
      _id: new ObjectId(),
      id,
      handlerKey: handlerKey as ReportHandlerKey,
      name,
      description,
      supportsPortfolio,
      supportsAccount,
      order,
      enabled: true,
      defaultConfig,
      defaultDeliveryChannels,
      ...(defaultTemplateId != null && { defaultTemplateId }),
      createdAt: now,
      updatedAt: now,
    };

    await coll.insertOne(doc);

    return NextResponse.json(
      { ...doc, _id: doc._id.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed to create report type:", error);
    return NextResponse.json({ error: "Failed to create report type" }, { status: 500 });
  }
}
