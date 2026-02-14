/**
 * Import accounts from a CSV (Account, Broker/Ref, Positions, Cost basis, Market value, ...).
 * Usage (from apps/frontend):
 *   node --env-file=../../.env.local scripts/import-accounts-csv.mjs [path/to/file.csv]
 * Default CSV: ../../data/myaccounts.csv (repo root data/)
 */
import { readFileSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(__dirname, "../../../data/myaccounts.csv");

function parseCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && c === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      row[h] = values[j] ?? "";
    });
    rows.push(row);
  }
  return { headers, rows };
}

async function main() {
  const csvPath = process.argv[2] ? path.resolve(process.cwd(), process.argv[2]) : defaultPath;
  if (!existsSync(csvPath)) {
    console.error("File not found:", csvPath);
    process.exit(1);
  }

  const content = readFileSync(csvPath, "utf8");
  const { headers, rows } = parseCsv(content);
  const nameCol = headers.find((h) => /account/i.test(h)) ?? "Account";
  const refCol = headers.find((h) => /broker|ref/i.test(h)) ?? "Broker/Ref";
  const marketCol = headers.find((h) => /market\s*value/i.test(h)) ?? "Market value";
  const costCol = headers.find((h) => /cost\s*basis/i.test(h)) ?? "Cost basis";

  if (rows.length === 0) {
    console.log("No data rows in CSV.");
    return;
  }

  // Expect MONGODB_URI_B64 (or MONGODB_URI) and MONGODB_DB
  let uri = process.env.MONGODB_URI_B64?.trim()
    ? Buffer.from(process.env.MONGODB_URI_B64.trim(), "base64").toString("utf8")
    : process.env.MONGODB_URI?.trim() || "mongodb://localhost:27017";
  const dbName = process.env.MONGODB_DB?.trim() || "myinvestments";

  const client = await MongoClient.connect(uri);
  try {
    const db = client.db(dbName);
    const coll = db.collection("accounts");
    const existing = await coll.find({ accountRef: { $exists: true, $ne: "" } }).project({ accountRef: 1 }).toArray();
    const existingRefs = new Set(existing.map((a) => String(a.accountRef ?? "").trim()));

    let inserted = 0;
    let skipped = 0;
    for (const row of rows) {
      const name = String(row[nameCol] ?? "").trim();
      const accountRef = String(row[refCol] ?? "").trim();
      const marketValue = parseFloat(String(row[marketCol] ?? "0").replace(/,/g, "")) || 0;
      const costBasis = parseFloat(String(row[costCol] ?? "0").replace(/,/g, "")) || 0;
      const balance = marketValue || costBasis;

      if (!name) {
        skipped++;
        continue;
      }
      if (accountRef && existingRefs.has(accountRef)) {
        console.log("Skip (already exists):", name, accountRef);
        skipped++;
        continue;
      }

      const doc = {
        name,
        ...(accountRef && { accountRef }),
        balance,
        riskLevel: "medium",
        strategy: "balanced",
        positions: [],
        recommendations: [],
      };
      await coll.insertOne(doc);
      if (accountRef) existingRefs.add(accountRef);
      inserted++;
      console.log("Inserted:", name, accountRef || "(no ref)", "balance:", balance);
    }

    console.log("\nDone. Inserted:", inserted, "Skipped:", skipped);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
