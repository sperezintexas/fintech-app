/**
 * Parse Merrill Edge CSV and output JSON for POST /api/import/activities.
 *
 * Usage:
 *   pnpm run merrill-to-activities [input.csv] [--output=file.json]
 *   node -r ts-node/register scripts/merrill-edge-to-activities.ts [input.csv] [--output=file.json]
 *
 * Default input: data/MerrillEdge.csv. Default output: stdout (or --output path).
 *
 * Output: { accounts: [ { accountRef, label, activities: ActivityImportItem[] } ] }
 * Map accountRef (e.g. "51X-98940") to your app's account _id, then:
 *   POST /api/import/activities with body: { accountId: "<your account _id>", activities: <activities array>, recomputePositions: true }
 */

import * as fs from "fs";
import * as path from "path";

type ActivityType = "BUY" | "SELL" | "DIVIDEND" | "FEE" | "INTEREST" | "LIABILITY";

type ActivityImportItem = {
  symbol: string;
  date: string;
  type: ActivityType;
  quantity: number;
  unitPrice: number;
  fee?: number;
  comment?: string;
  optionType?: "call" | "put";
  strike?: number;
  expiration?: string;
};

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

/** Extract underlying symbol from Symbol/CUSIP (e.g. TSLA#B1326C425000 -> TSLA, LUNR#N2026D190000 -> LUNR). */
function underlyingFromSymbol(symbolCusip: string): string {
  const s = symbolCusip.trim();
  if (!s || s === "--") return "";
  const hash = s.indexOf("#");
  if (hash >= 0) return s.slice(0, hash).toUpperCase();
  return s.toUpperCase();
}

/** Parse option details from Description 2: CALL TSLA 00425 ... EXP 02-13-26 or PUT LUNR 00019 ... EXP 02-20-26. */
function parseOptionFromDescription(desc2: string): { optionType: "call" | "put"; symbol: string; strike: number; expiration: string } | null {
  const m = desc2.match(/(CALL|PUT)\s+(\w+)\s+(\d+(?:\.\d+)?)\s+.*?EXP\s+(\d{2})-(\d{2})-(\d{2})/i);
  if (!m) return null;
  const [, side, sym, strikeStr, mm, dd, yy] = m;
  const optionType = side!.toLowerCase() === "put" ? "put" : "call";
  const strike = parseFloat(strikeStr!);
  const year = yy!.length === 2 ? (parseInt(yy, 10) >= 50 ? `19${yy}` : `20${yy}`) : yy!;
  const expiration = `${year}-${mm}-${dd}`;
  return { optionType, symbol: sym!.toUpperCase(), strike, expiration };
}

/** Map Merrill "Description 1" to activity type and whether quantity should be negated. */
function mapDescription1(desc1: string): { type: ActivityType; flipQty: boolean } | null {
  const d = desc1.trim().toLowerCase();
  if (d === "sell" || d === "option sale" || d === "option sale " || d === "sale" || d === "sale ") {
    return { type: "SELL", flipQty: false }; // Merrill already uses negative qty for sells
  }
  if (d === "option purchase" || d === "option purchase " || d === "buy" || d === "purchase") {
    return { type: "BUY", flipQty: false };
  }
  if (d === "option expired") {
    return { type: "SELL", flipQty: false }; // close position at 0
  }
  if (d === "interest") {
    return { type: "INTEREST", flipQty: false };
  }
  if (d.includes("dividend")) {
    return { type: "DIVIDEND", flipQty: false };
  }
  return null;
}

function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find((a) => !a.startsWith("--")) ?? path.join(process.cwd(), "data", "MerrillEdge.csv");
  const outputArg = args.find((a) => a.startsWith("--output="));
  const outputPath = outputArg ? outputArg.slice("--output=".length) : null;

  const raw = fs.readFileSync(inputPath, "utf-8");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) {
    console.error("CSV must have header and at least one row");
    process.exit(1);
  }

  const header = parseCsvLine(lines[0]);
  const col = (name: string) => {
    const i = header.findIndex((h) => h.trim().toLowerCase().includes(name.toLowerCase()));
    return i >= 0 ? i : -1;
  };
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
    console.error("Required columns not found (Trade Date, Symbol/CUSIP, Quantity)");
    process.exit(1);
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

    const optionInfo = parseOptionFromDescription(desc2);
    if (optionInfo && (symbolCusip.includes("#") || optionInfo.symbol)) {
      activity.symbol = optionInfo.symbol;
      activity.optionType = optionInfo.optionType;
      activity.strike = optionInfo.strike;
      activity.expiration = optionInfo.expiration;
    }

    if (desc2) activity.comment = desc2.slice(0, 200);

    bag.activities.push(activity);
  }

  const accounts = Array.from(byAccount.entries()).map(([accountRef, { label, activities }]) => ({
    accountRef,
    label,
    activities,
  }));

  const payload = { accounts };
  const json = JSON.stringify(payload, null, 2);

  if (outputPath) {
    fs.writeFileSync(outputPath, json, "utf-8");
    console.error(`Wrote ${accounts.length} account(s) to ${outputPath}`);
  } else {
    console.log(json);
  }
}

main();
