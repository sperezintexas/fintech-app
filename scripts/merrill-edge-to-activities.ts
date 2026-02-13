/**
 * Parse Merrill Edge CSV and output JSON for POST /api/import/activities.
 *
 * Usage:
 *   pnpm run merrill-to-activities [input.csv] [--output=file.json]
 *   pnpm run merrill-to-activities -- --output=out.json   # use default data/MerrillEdge.csv
 *
 * Default input: data/MerrillEdge.csv. Default output: stdout (or --output path).
 *
 * Output: { accounts: [ { accountRef, label, activities: ActivityImportItem[] } ] }
 * Map accountRef (e.g. "51X-98940") to your app's account _id, then:
 *   POST /api/import/activities with body: { accountId: "<your account _id>", activities: <activities array>, recomputePositions: true }
 */

import * as fs from "fs";
import * as path from "path";
import { parseMerrillCsv } from "../apps/frontend/src/lib/merrill-csv";

function main() {
  const args = process.argv.slice(2);
  const inputPath = args.find((a) => !a.startsWith("--")) ?? path.join(process.cwd(), "data", "MerrillEdge.csv");
  const outputArg = args.find((a) => a.startsWith("--output="));
  const outputPath = outputArg ? outputArg.slice("--output=".length) : null;

  const raw = fs.readFileSync(inputPath, "utf-8");
  const { accounts } = parseMerrillCsv(raw);
  if (accounts.length === 0) {
    console.error("No accounts parsed. Check CSV has header and required columns (Trade Date, Symbol/CUSIP, Quantity).");
    process.exit(1);
  }

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
