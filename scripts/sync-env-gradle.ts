/**
 * Optional: sync backend-related env vars from repo root .env.local to ~/.gradle/gradle.properties.
 * Best practice is to use a single .env.local at repo root; bootRun already loads it when you run
 * from root or apps/backend. Use this script only if you want the same vars in ~/.gradle (e.g.
 * for other Gradle runs from a different cwd). Run from repo root.
 *
 * Usage: pnpm run sync-env-gradle
 */
/// <reference types="node" />

import * as fs from "fs";
import * as path from "path";

const REPO_ROOT = path.resolve(process.cwd());
const ENV_LOCAL = path.join(REPO_ROOT, ".env.local");
const GRADLE_PROPS = path.join(
  process.env.HOME || process.env.USERPROFILE || "",
  ".gradle",
  "gradle.properties"
);

const BACKEND_KEYS = [
  "MONGODB_URI",
  "MONGODB_DB",
  "SERVER_PORT",
  "APP_VERSION",
  "SCHEDULER_ENABLED",
  "NEXTJS_URL",
  "CRON_SECRET",
] as const;

function parseEnvFile(filePath: string): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(filePath)) return m;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1);
    m.set(key, value);
  }
  return m;
}

function parseGradleProperties(filePath: string): Map<string, string> {
  const m = new Map<string, string>();
  if (!fs.existsSync(filePath)) return m;
  const content = fs.readFileSync(filePath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    m.set(key, value);
  }
  return m;
}

function writeGradleProperties(filePath: string, props: Map<string, string>): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const lines = Array.from(props.entries()).map(([k, v]) => `${k}=${v}`);
  fs.writeFileSync(filePath, lines.join("\n") + "\n", "utf-8");
}

function main(): void {
  if (!fs.existsSync(ENV_LOCAL)) {
    console.error(".env.local not found at", ENV_LOCAL);
    process.exit(1);
  }
  if (!GRADLE_PROPS.startsWith("/") && !GRADLE_PROPS.includes(":\\")) {
    console.error("Cannot resolve HOME for ~/.gradle/gradle.properties");
    process.exit(1);
  }

  const env = parseEnvFile(ENV_LOCAL);
  const gradle = parseGradleProperties(GRADLE_PROPS);

  let updated = 0;
  for (const key of BACKEND_KEYS) {
    const v = env.get(key);
    if (v !== undefined && v !== gradle.get(key)) {
      gradle.set(key, v);
      updated++;
    }
  }

  writeGradleProperties(GRADLE_PROPS, gradle);
  console.log(
    updated > 0
      ? `Synced ${updated} var(s) from .env.local → ${GRADLE_PROPS}`
      : `No changes; ${GRADLE_PROPS} already in sync with .env.local`
  );
}

main();
