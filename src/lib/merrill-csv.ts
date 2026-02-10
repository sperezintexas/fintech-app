/**
 * Parse Merrill Edge CSV into activities-by-account. Shared by CLI script and API.
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

function toIsoDate(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return "";
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

function underlyingFromSymbol(symbolCusip: string): string {
  const s = symbolCusip.trim();
  if (!s || s === "--") return "";
  const hash = s.indexOf("#");
  if (hash >= 0) return s.slice(0, hash).toUpperCase();
  return s.toUpperCase();
}

/**
 * Parse OCC-style option suffix after # (e.g. B1326C425000 from TSLA#B1326C425000).
 * Merrill format: [Call/Put letter][DD][M][Y][C/D][Strike*1000]
 * - First letter: B = Call, N = Put (Merrill)
 * - Next 4 digits: DD=day (13), M=month (2), Y=year digit (6 → 2026) → 2026-02-13
 * - C = Credit (long/positive qty), D = Debit (short/negative qty)
 * - Then strike*1000 (425000 → 425). So B1326C425000 = Call, 2026-02-13, 425. N1326D130000 = Put, debit, 13.
 */
function parseOccOptionSuffix(
  suffix: string,
  underlying: string
): { optionType: "call" | "put"; symbol: string; strike: number; expiration: string; isDebit: boolean } | null {
  const t = suffix.trim();
  if (!t || t.length < 8) return null;
  const callPutChar = t[0];
  const optionType = callPutChar === "N" || callPutChar === "P" ? "put" : "call";
  const dd = t.slice(1, 3);
  const m = t.slice(3, 4);
  const y = t.slice(4, 5);
  const creditDebit = t.slice(5, 6).toUpperCase();
  const isDebit = creditDebit === "D";
  const ddNum = parseInt(dd, 10);
  const mNum = parseInt(m, 10);
  const yNum = parseInt(y, 10);
  if (Number.isNaN(ddNum) || Number.isNaN(mNum) || Number.isNaN(yNum)) return null;
  if (ddNum < 1 || ddNum > 31 || mNum < 1 || mNum > 12) return null;
  const year = 2000 + yNum;
  const expiration = `${year}-${String(mNum).padStart(2, "0")}-${String(ddNum).padStart(2, "0")}`;
  const strikePart = t.slice(6).replace(/^[A-Z]/i, "");
  const strikeNum = parseInt(strikePart, 10);
  if (Number.isNaN(strikeNum) || strikeNum < 0) return null;
  const strike = strikeNum >= 100000 ? strikeNum / 10000 : strikeNum / 1000;
  return { optionType, symbol: underlying, strike, expiration, isDebit };
}

function parseOptionFromDescription(
  desc2: string
): { optionType: "call" | "put"; symbol: string; strike: number; expiration: string } | null {
  const m = desc2.match(/(CALL|PUT)\s+(\w+)\s+(\d+(?:\.\d+)?)\s+.*?EXP\s+(\d{2})-(\d{2})-(\d{2})/i);
  if (!m) return null;
  const [, side, sym, strikeStr, mm, dd, yy] = m;
  const optionType = side!.toLowerCase() === "put" ? "put" : "call";
  const strike = parseFloat(strikeStr!);
  const year = yy!.length === 2 ? (parseInt(yy, 10) >= 50 ? `19${yy}` : `20${yy}`) : yy!;
  const expiration = `${year}-${mm}-${dd}`;
  return { optionType, symbol: sym!.toUpperCase(), strike, expiration };
}

function mapDescription1(desc1: string): { type: ActivityType; flipQty: boolean } | null {
  const d = desc1.trim().toLowerCase();
  if (d === "sell" || d === "option sale" || d === "option sale " || d === "sale" || d === "sale ") {
    return { type: "SELL", flipQty: false };
  }
  if (d === "option purchase" || d === "option purchase " || d === "buy" || d === "purchase") {
    return { type: "BUY", flipQty: false };
  }
  if (d === "option expired") {
    return { type: "SELL", flipQty: false };
  }
  if (d === "interest") {
    return { type: "INTEREST", flipQty: false };
  }
  if (d.includes("dividend")) {
    return { type: "DIVIDEND", flipQty: false };
  }
  return null;
}

export type MerrillFormatResult = {
  accounts: Array<{
    accountRef: string;
    label: string;
    activities: ActivityImportItem[];
  }>;
};

/**
 * Parse Merrill Edge CSV string into activities grouped by account.
 * Requires columns: Trade Date, Symbol/CUSIP, Quantity. Optional: Account #, Description 1/2, Price, Amount.
 */
export function parseMerrillCsv(csv: string): MerrillFormatResult {
  const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    return { accounts: [] };
  }

  const header = parseCsvLine(lines[0]);
  const iTradeDate = header.findIndex((h) => /trade date/i.test(h));
  const iAccountReg = header.findIndex((h) => /account registration/i.test(h));
  const iAccountNum = header.findIndex((h) => /account #/i.test(h));
  const iType = header.findIndex((h) => /^type$/i.test(h));
  const iDesc1 = header.findIndex((h) => /description 1/i.test(h));
  const iDesc2 = header.findIndex((h) => /description 2/i.test(h));
  const iSymbol = header.findIndex((h) => /symbol\/cusip/i.test(h));
  const iQty = header.findIndex((h) => /quantity/i.test(h));
  const iPrice = header.findIndex((h) => /price/i.test(h));
  const iAmount = header.findIndex((h) => /amount/i.test(h));

  if (iTradeDate < 0 || iSymbol < 0 || iQty < 0) {
    return { accounts: [] };
  }

  /** Skip rows where accountRef/label look like numbers (misaligned columns). */
  function looksLikeAccountRef(s: string): boolean {
    const t = (s ?? "").replace(/,/g, "").trim();
    if (!t) return false;
    if (/^\d+\.?\d*$/.test(t)) return false;
    if (/^[\d,]+\.?\d*$/.test(t)) return false;
    return true;
  }

  const byAccount = new Map<string, { label: string; activities: ActivityImportItem[] }>();

  for (let r = 1; r < lines.length; r++) {
    const row = parseCsvLine(lines[r]);
    const type = row[iType] ?? "";
    const desc1 = (row[iDesc1] ?? "").trim();
    const desc2 = row[iDesc2] ?? "";
    const symbolCusip = (row[iSymbol] ?? "").trim();
    const qtyRaw = row[iQty] ?? "";
    const priceRaw = row[iPrice] ?? "";
    const amountRaw = row[iAmount] ?? "";

    if (type === "Other" && (desc1.includes("Transfer") || desc1.includes("Withdrawal"))) {
      continue;
    }
    if (symbolCusip === "--" && !desc1.toLowerCase().includes("interest")) {
      continue;
    }

    const mapped = mapDescription1(desc1);
    if (!mapped) continue;

    const accountRef = (row[iAccountNum] ?? "").trim() || (row[iAccountReg] ?? "").trim();
    const label = (row[iAccountReg] ?? "").trim() || accountRef;
    if (!looksLikeAccountRef(accountRef) && !looksLikeAccountRef(label)) continue;
    const key = accountRef || label || "default";
    if (!byAccount.has(key)) {
      byAccount.set(key, { label, activities: [] });
    }
    const bag = byAccount.get(key)!;

    const date = toIsoDate(row[iTradeDate] ?? "");
    if (!date) continue;

    let quantity = parseNum(qtyRaw);
    if (quantity === null) continue;
    quantity = Math.abs(quantity);
    if (quantity === 0 && mapped.type !== "INTEREST") continue;

    let unitPrice = parseNum(priceRaw);
    if (unitPrice === null && amountRaw && quantity > 0) {
      const amt = parseNum(amountRaw);
      if (amt !== null) unitPrice = Math.abs(amt) / quantity;
    }
    if (unitPrice === null) unitPrice = 0;

    const symbol = underlyingFromSymbol(symbolCusip);
    if (!symbol && mapped.type !== "INTEREST") continue;

    const activity: ActivityImportItem = {
      symbol: symbol || "CASH",
      date,
      type: mapped.type,
      quantity,
      unitPrice,
    };

    let optionInfo = parseOptionFromDescription(desc2);
    if (!optionInfo && symbolCusip.includes("#")) {
      const suffix = symbolCusip.slice(symbolCusip.indexOf("#") + 1);
      optionInfo = parseOccOptionSuffix(suffix, symbol || underlyingFromSymbol(symbolCusip));
    }
    if (optionInfo && (symbolCusip.includes("#") || optionInfo.symbol)) {
      activity.symbol = optionInfo.symbol;
      activity.optionType = optionInfo.optionType;
      activity.strike = optionInfo.strike;
      activity.expiration = optionInfo.expiration;
      if ("isDebit" in optionInfo && optionInfo.isDebit && activity.quantity > 0) {
        activity.quantity = -activity.quantity;
      }
    }

    if (desc2) activity.comment = desc2.slice(0, 200);

    bag.activities.push(activity);
  }

  const accounts = Array.from(byAccount.entries()).map(([accountRef, { label, activities }]) => ({
    accountRef,
    label,
    activities,
  }));

  return { accounts };
}
