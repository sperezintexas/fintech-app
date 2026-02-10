/**
 * Parse broker-style CSV into ActivityImportItem[] for ghostbranch Phase 2.
 * Supports generic header detection (Date, Symbol, Action/Side, Quantity, Price, Fee).
 */

import type { ActivityImportItem, ActivityType } from "@/types/portfolio";

const DATE_HEADERS = [
  "date",
  "trade date",
  "transaction date",
  "settlement date",
];
const SYMBOL_HEADERS = ["symbol", "ticker", "security", "symbol description"];
const ACTION_HEADERS = [
  "action",
  "side",
  "type",
  "transaction type",
  "activity",
];
const QUANTITY_HEADERS = ["quantity", "qty", "shares", "contracts", "amount"];
const PRICE_HEADERS = [
  "price",
  "unit price",
  "price ($)",
  "last price",
  "trade price",
];
const FEE_HEADERS = [
  "fee",
  "fees",
  "commission",
  "commission ($)",
  "fees & comm",
  "fees & commission",
];

const ACTION_MAP: Record<string, ActivityType> = {
  buy: "BUY",
  bought: "BUY",
  b: "BUY",
  "buy to open": "BUY",
  bto: "BUY",
  "buy to close": "BUY",
  btc: "BUY",
  sell: "SELL",
  sold: "SELL",
  s: "SELL",
  "sell to close": "SELL",
  stc: "SELL",
  "sell to open": "SELL",
  sto: "SELL",
  dividend: "DIVIDEND",
  div: "DIVIDEND",
  "dividend reinvested": "DIVIDEND",
  dripp: "DIVIDEND",
  fee: "FEE",
  commission: "FEE",
  interest: "INTEREST",
  "interest income": "INTEREST",
};

function findColumnIndex(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.toLowerCase().trim());
  for (const alias of aliases) {
    const i = normalized.findIndex(
      (h) => h === alias || h.includes(alias) || alias.includes(h)
    );
    if (i >= 0) return i;
  }
  return -1;
}

/** Parse a date string to YYYY-MM-DD. Supports ISO, MM/DD/YYYY, M/D/YYYY, DD-MM-YYYY. */
function parseDate(value: string): string | null {
  const s = value.trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNum(value: string): number | null {
  if (value == null || value === "") return null;
  const cleaned = String(value).replace(/,/g, "").replace(/[$]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

function mapAction(raw: string): ActivityType | null {
  const key = raw.toLowerCase().trim();
  return ACTION_MAP[key] ?? ACTION_MAP[key.replace(/\s+/g, " ")] ?? null;
}

export type CsvImportResult = {
  activities: ActivityImportItem[];
  errors: string[];
};

/**
 * Parse broker-style CSV into activities. First row = headers (case-insensitive).
 * Required columns: date, symbol, action, quantity, price.
 * Optional: fee. Unrecognized action or missing required field → error entry, row skipped.
 */
export function parseBrokerCsv(
  csv: string,
  _format?: "generic" | "fidelity" | "schwab"
): CsvImportResult {
  const activities: ActivityImportItem[] = [];
  const errors: string[] = [];
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    errors.push("CSV must have a header row and at least one data row");
    return { activities, errors };
  }

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine);
  const dateIdx = findColumnIndex(headers, DATE_HEADERS);
  const symbolIdx = findColumnIndex(headers, SYMBOL_HEADERS);
  const actionIdx = findColumnIndex(headers, ACTION_HEADERS);
  const qtyIdx = findColumnIndex(headers, QUANTITY_HEADERS);
  const priceIdx = findColumnIndex(headers, PRICE_HEADERS);
  const feeIdx = findColumnIndex(headers, FEE_HEADERS);

  if (dateIdx < 0) errors.push("No date column found (look for: Date, Trade Date)");
  if (symbolIdx < 0) errors.push("No symbol column found (look for: Symbol, Ticker)");
  if (actionIdx < 0) errors.push("No action column found (look for: Action, Side, Type)");
  if (qtyIdx < 0) errors.push("No quantity column found (look for: Quantity, Qty, Shares)");
  if (priceIdx < 0) errors.push("No price column found (look for: Price, Unit Price)");
  if (dateIdx < 0 || symbolIdx < 0 || actionIdx < 0 || qtyIdx < 0 || priceIdx < 0) {
    return { activities, errors };
  }

  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const rowNum = i + 1;
    const dateStr = row[dateIdx] != null ? String(row[dateIdx]).trim() : "";
    const symbol = row[symbolIdx] != null ? String(row[symbolIdx]).trim() : "";
    const actionStr = row[actionIdx] != null ? String(row[actionIdx]).trim() : "";
    const qtyRaw = row[qtyIdx];
    const priceRaw = row[priceIdx];
    const feeRaw = feeIdx >= 0 ? row[feeIdx] : null;

    const date = parseDate(dateStr);
    if (!date) {
      errors.push(`Row ${rowNum}: invalid or missing date`);
      continue;
    }
    if (!symbol) {
      errors.push(`Row ${rowNum}: missing symbol`);
      continue;
    }
    const type = mapAction(actionStr);
    if (!type) {
      errors.push(`Row ${rowNum}: unrecognized action "${actionStr}"`);
      continue;
    }
    const quantity = parseNum(String(qtyRaw ?? ""));
    if (quantity === null) {
      errors.push(`Row ${rowNum}: invalid quantity`);
      continue;
    }
    const unitPrice = parseNum(String(priceRaw ?? ""));
    if (unitPrice === null) {
      errors.push(`Row ${rowNum}: invalid price`);
      continue;
    }
    const fee = feeRaw != null && feeRaw !== "" ? parseNum(String(feeRaw)) ?? 0 : undefined;

    activities.push({
      symbol,
      date,
      type,
      quantity,
      unitPrice,
      ...(fee != null && fee !== 0 ? { fee } : {}),
    });
  }

  return { activities, errors };
}

/** Simple CSV line parse: handle quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let end = i + 1;
      const parts: string[] = [];
      while (end < line.length) {
        const next = line.indexOf('"', end);
        if (next < 0) {
          parts.push(line.slice(end));
          end = line.length;
          break;
        }
        parts.push(line.slice(end, next));
        if (line[next + 1] === '"') {
          parts.push('"');
          end = next + 2;
        } else {
          end = next + 1;
          break;
        }
      }
      out.push(parts.join(""));
      i = end;
      if (line[i] === ",") i++;
    } else {
      const comma = line.indexOf(",", i);
      if (comma < 0) {
        out.push(line.slice(i).trim());
        break;
      }
      out.push(line.slice(i, comma).trim());
      i = comma + 1;
    }
  }
  return out;
}
