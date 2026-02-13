import { getDb } from "@/lib/mongodb";
import type { AlertTemplate } from "@/types/portfolio";
import { ALERT_TEMPLATES } from "@/types/portfolio";
import type { ReportTemplate } from "@/types/portfolio";
import { REPORT_TEMPLATES } from "@/types/portfolio";

const COLLECTION = "messageTemplates";

/** Get alert templates: DB override if present, else file default */
export async function getAlertTemplates(): Promise<AlertTemplate[]> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ key: "alert" });
  if (doc && Array.isArray(doc.templates)) {
    return doc.templates as AlertTemplate[];
  }
  return ALERT_TEMPLATES;
}

/** Get report templates: DB override if present, else file default */
export async function getReportTemplates(): Promise<ReportTemplate[]> {
  const db = await getDb();
  const doc = await db.collection(COLLECTION).findOne({ key: "report" });
  if (doc && Array.isArray(doc.templates)) {
    return doc.templates as ReportTemplate[];
  }
  return REPORT_TEMPLATES;
}

/** Save alert templates to DB */
export async function setAlertTemplates(templates: AlertTemplate[]): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.collection(COLLECTION).updateOne(
    { key: "alert" },
    { $set: { key: "alert", templates, updatedAt: now } },
    { upsert: true }
  );
}

/** Save report templates to DB */
export async function setReportTemplates(templates: ReportTemplate[]): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.collection(COLLECTION).updateOne(
    { key: "report" },
    { $set: { key: "report", templates, updatedAt: now } },
    { upsert: true }
  );
}
