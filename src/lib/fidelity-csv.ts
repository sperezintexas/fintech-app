/**
 * Parse Fidelity "Activity - All Accounts" CSV into activities grouped by account.
 * Columns: Date, Description, Symbol, Quantity, Price, Amount, Cash Balance, Security Description, Commission, Fees, Account
 * Output shape: { accounts: [ { accountRef, label, activities: ActivityImportItem[] } ] }
 */

import type { ActivityImportItem, ActivityType } from "@/types/portfolio";

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

function toIsoDate(s: string): string | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseNum(val: string): number | null {
  if (val == null || val === "" || val === "--") return null;
  const cleaned = String(val).replace(/,/g, "").replace(/[$()]/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? null : n;
}

/** Map Fidelity Description or Action to ActivityType. Returns null for non-importable rows. */
function descriptionToType(description: string): ActivityType | null {
  const d = description.toUpperCase();
  if (d.includes("YOU BOUGHT")) return "BUY";
  if (d.includes("YOU SOLD")) return "SELL";
  if (d.includes("DIVIDEND RECEIVED")) return "DIVIDEND";
  if (d.includes("REINVESTMENT")) return "DIVIDEND";
  if (d.includes("CREDIT INTEREST") || d.includes("INTEREST RECEIVED") || d.includes("INTEREST EARNED")) return "INTEREST";
  if (d.includes("COMMISSION") || d.includes("FEE")) return "FEE";
  return null;
}

/** Extract accountRef from Account column: "Individual - TOD *0196" -> "0196"; "Rollover IRA *8941" -> "8941". */
export function fidelityAccountToRef(accountLabel: string): string {
  const m = accountLabel.trim().match(/\*(\d{4,})$/);
  if (m) return m[1];
  return accountLabel.trim();
}

export type FidelityActivitiesResult = {
  accounts: Array<{
    accountRef: string;
    label: string;
    activities: ActivityImportItem[];
  }>;
  parseError?: string;
};

/**
 * Parse Fidelity Activity CSV. Skips title lines until header "Date,Description,Symbol,...".
 * Groups rows by Account column; only imports rows with a mappable Description (BUY/SELL/DIVIDEND/INTEREST/FEE).
 */
export function parseFidelityCsv(csv: string): FidelityActivitiesResult {
  const normalized = csv.replace(/\uFEFF/g, "").trim();
  const lines = normalized.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  const byAccount = new Map<string, { label: string; activities: ActivityImportItem[] }>();

  let headerRow: string[] | null = null;
  let dataStartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const first = (row[0] ?? "").trim();
    if (/^date$/i.test(first) && row.length >= 2) {
      headerRow = row.map((h) => h.replace(/\uFEFF/g, "").trim());
      dataStartIndex = i + 1;
      break;
    }
    if (first.toLowerCase().startsWith("disclosure") || /^totals$/i.test(first)) break;
  }

  if (!headerRow || dataStartIndex < 0) {
    return { accounts: [], parseError: "Could not find header row starting with Date" };
  }

  const iDate = headerRow.findIndex((h) => /^date$/i.test(h));
  const iDesc = headerRow.findIndex((h) => /^description$/i.test(h));
  const iSymbol = headerRow.findIndex((h) => /^symbol$/i.test(h));
  const iQty = headerRow.findIndex((h) => /^quantity$/i.test(h));
  const iPrice = headerRow.findIndex((h) => /^price$/i.test(h));
  const iAmount = headerRow.findIndex((h) => /^amount$/i.test(h));
  const iCommission = headerRow.findIndex((h) => /^commission$/i.test(h));
  const iFees = headerRow.findIndex((h) => /^fees$/i.test(h));
  const iAccount = headerRow.findIndex((h) => /^account$/i.test(h));

  if (iDate < 0 || iDesc < 0 || iAccount < 0) {
    return {
      accounts: [],
      parseError: "Required columns Date, Description, Account not found",
    };
  }

  for (let r = dataStartIndex; r < lines.length; r++) {
    const row = parseCsvLine(lines[r]);
    const firstCell = (row[0] ?? "").trim();
    if (firstCell.toLowerCase().startsWith("disclosure") || /^totals$/i.test(firstCell)) break;

    const dateStr = row[iDate] ?? "";
    const date = toIsoDate(dateStr);
    if (!date) continue;

    const description = (row[iDesc] ?? "").trim();
    const type = descriptionToType(description);
    if (!type) continue;

    const accountLabel = (row[iAccount] ?? "").trim();
    if (!accountLabel) continue;

    const accountRef = fidelityAccountToRef(accountLabel);
    const symbol = (row[iSymbol] ?? "").trim().toUpperCase() || "CASH";
    const qtyRaw = row[iQty] ?? "";
    let quantity = parseNum(qtyRaw);
    if (quantity === null) {
      if (type === "DIVIDEND" || type === "INTEREST") quantity = 1;
      else continue;
    }
    const priceRaw = row[iPrice] ?? "";
    let unitPrice = parseNum(priceRaw);
    if (unitPrice === null && type !== "FEE") {
      const amountRaw = row[iAmount] ?? "";
      const amount = parseNum(amountRaw);
      if (amount !== null && quantity !== 0) unitPrice = Math.abs(amount) / Math.abs(quantity);
      else unitPrice = 0;
    }
    if (unitPrice === null) unitPrice = 0;

    const commission = iCommission >= 0 ? parseNum(row[iCommission] ?? "") : null;
    const fees = iFees >= 0 ? parseNum(row[iFees] ?? "") : null;
    const fee = (commission ?? 0) + (fees ?? 0);

    if (!byAccount.has(accountRef)) {
      byAccount.set(accountRef, { label: accountLabel, activities: [] });
    }
    byAccount.get(accountRef)!.activities.push({
      symbol,
      date,
      type,
      quantity,
      unitPrice,
      ...(fee !== 0 ? { fee } : {}),
    });
  }

  const accounts = Array.from(byAccount.entries()).map(([accountRef, { label, activities }]) => ({
    accountRef,
    label,
    activities,
  }));

  return { accounts };
}

/** Extract accountRef from Fidelity "Account Number" (e.g. X65430196 → 0196, 221238941 → 8941). */
function accountNumberToRef(accountNumber: string): string {
  const digits = String(accountNumber).replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return digits || accountNumber.trim();
}

/**
 * Parse Fidelity "FidelityAccounts" / transactions-by-account CSV.
 * Columns: Run Date, Account, Account Number, Action, Symbol, Description, Type, ..., Price, Quantity, Commission, Fees, Amount
 * Use when the export has "Run Date" and "Account Number" (not "Activity_All_Accounts" with Account *0196).
 */
export function parseFidelityAccountsCsv(csv: string): FidelityActivitiesResult {
  const normalized = csv.replace(/\uFEFF/g, "").trim();
  const lines = normalized.split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  const byAccount = new Map<string, { label: string; activities: ActivityImportItem[] }>();

  let headerRow: string[] | null = null;
  let dataStartIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const first = (row[0] ?? "").trim();
    const hasRunDate = headerRow === null && row.some((c) => /^run\s+date$/i.test(String(c).trim()));
    if (hasRunDate && row.some((c) => /^account\s+number$/i.test(String(c).trim()))) {
      headerRow = row.map((h) => String(h).replace(/\uFEFF/g, "").trim());
      dataStartIndex = i + 1;
      break;
    }
    if (first.toLowerCase().startsWith("disclosure") || first === '"') break;
  }

  if (!headerRow || dataStartIndex < 0) {
    return { accounts: [], parseError: "Could not find header with Run Date and Account Number" };
  }

  const iRunDate = headerRow.findIndex((h) => /^run\s+date$/i.test(h));
  const iAccount = headerRow.findIndex((h) => /^account$/i.test(h));
  const iAccountNumber = headerRow.findIndex((h) => /^account\s+number$/i.test(h));
  const iAction = headerRow.findIndex((h) => /^action$/i.test(h));
  const iSymbol = headerRow.findIndex((h) => /^symbol$/i.test(h));
  const iQty = headerRow.findIndex((h) => /^quantity$/i.test(h));
  const iPrice = headerRow.findIndex((h) => /^price$/i.test(h));
  const iCommission = headerRow.findIndex((h) => /^commission$/i.test(h));
  const iFees = headerRow.findIndex((h) => /^fees$/i.test(h));
  const iAmount = headerRow.findIndex((h) => /^amount$/i.test(h));

  if (iRunDate < 0 || iAccountNumber < 0 || iAction < 0) {
    return {
      accounts: [],
      parseError: "Required columns Run Date, Account Number, Action not found",
    };
  }

  for (let r = dataStartIndex; r < lines.length; r++) {
    const row = parseCsvLine(lines[r]);
    const firstCell = (row[0] ?? "").trim();
    if (firstCell.toLowerCase().startsWith("disclosure") || firstCell === '"') break;

    const dateStr = row[iRunDate] ?? "";
    const date = toIsoDate(dateStr);
    if (!date) continue;

    const actionStr = (row[iAction] ?? "").trim();
    const type = descriptionToType(actionStr);
    if (!type) continue;

    const accountNumber = (row[iAccountNumber] ?? "").trim();
    const accountLabel = (row[iAccount] ?? "").trim();
    if (!accountNumber) continue;

    const accountRef = accountNumberToRef(accountNumber);
    const symbol = (row[iSymbol] ?? "").trim().replace(/^\s*-?\s*/, "").toUpperCase() || "CASH";
    let quantity = parseNum(row[iQty] ?? "");
    if (quantity === null) {
      if (type === "DIVIDEND" || type === "INTEREST") quantity = 1;
      else continue;
    }
    let unitPrice = parseNum(row[iPrice] ?? "");
    if (unitPrice === null && type !== "FEE") {
      const amount = parseNum(row[iAmount] ?? "");
      if (amount !== null && quantity !== 0) unitPrice = Math.abs(amount) / Math.abs(quantity);
      else unitPrice = 0;
    }
    if (unitPrice === null) unitPrice = 0;

    const commission = iCommission >= 0 ? parseNum(row[iCommission] ?? "") : null;
    const fees = iFees >= 0 ? parseNum(row[iFees] ?? "") : null;
    const fee = (commission ?? 0) + (fees ?? 0);

    if (!byAccount.has(accountRef)) {
      byAccount.set(accountRef, { label: accountLabel || accountRef, activities: [] });
    }
    byAccount.get(accountRef)!.activities.push({
      symbol,
      date,
      type,
      quantity,
      unitPrice,
      ...(fee !== 0 ? { fee } : {}),
    });
  }

  const accounts = Array.from(byAccount.entries()).map(([accountRef, { label, activities }]) => ({
    accountRef,
    label,
    activities,
  }));

  return { accounts };
}

/** Detect Fidelity activity CSV format and parse. Supports "Activity_All_Accounts" (Date, Description, Account *0196) and "FidelityAccounts" (Run Date, Account Number, Action). */
export function parseFidelityActivitiesCsv(csv: string): FidelityActivitiesResult {
  const lines = csv.replace(/\uFEFF/g, "").trim().split(/\r\n|\r|\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.toLowerCase().startsWith("disclosure") || line === '"') break;
    const header = parseCsvLine(line);
    const hasRunDate = header.some((c) => /^run\s+date$/i.test(String(c).trim()));
    const hasAccountNumber = header.some((c) => /^account\s+number$/i.test(String(c).trim()));
    if (hasRunDate && hasAccountNumber) return parseFidelityAccountsCsv(csv);
    const hasDateDesc = header[0] != null && /^date$/i.test(String(header[0]).trim()) && header.some((c) => /^description$/i.test(String(c).trim()));
    if (hasDateDesc) return parseFidelityCsv(csv);
  }
  return parseFidelityCsv(csv);
}
