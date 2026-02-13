#!/usr/bin/env node
/**
 * CLI to debug and test X (Twitter) posting credentials.
 * Loads .env.local from repo root, prints env vars (masked), then tests v2.me() and optional post.
 *
 * From repo root:
 *   node apps/frontend/scripts/test-x-post-cli.mjs
 *   ENV_FILE=.env.local node apps/frontend/scripts/test-x-post-cli.mjs
 * Or from apps/frontend:
 *   node scripts/test-x-post-cli.mjs
 *
 * Optional: SHOW_VARS=1 to print first 4 + "..." + last 4 of each value (for debugging).
 * Optional: POST=1 to post a test tweet after verifying credentials.
 */

import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(envFile = ".env.local") {
  // __dirname = apps/frontend/scripts → ../../ = repo root
  const candidates = [
    path.resolve(__dirname, "../../..", envFile),
    path.resolve(__dirname, "../..", envFile),
    path.resolve(process.cwd(), envFile),
    path.resolve(process.cwd(), "../..", envFile),
  ];
  const envPath = candidates.find((p) => existsSync(p));
  if (!envPath) {
    console.error("No .env file found. Tried:", candidates.join(", "));
    process.exit(1);
  }
  console.log("Loading env from:", envPath);
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

const X_KEYS = [
  "X_BEARER_TOKEN",
  "X_CONSUMER_KEY",
  "X_CONSUMER_SECRET",
  "X_ACCESS_TOKEN",
  "X_ACCESS_TOKEN_SECRET",
  "X_CLIENT_ID",
  "X_CLIENT_SECRET",
  "X_POST_AS_USERNAME",
];

function mask(val, showPeek = false) {
  if (val == null || val === "") return "(empty)";
  const s = String(val).trim();
  if (s.length === 0) return "(empty)";
  if (showPeek && s.length > 12) return `len=${s.length} [${s.slice(0, 4)}...${s.slice(-4)}]`;
  return `len=${s.length}`;
}

function printEnvDebug() {
  const showPeek = process.env.SHOW_VARS === "1" || process.env.SHOW_VARS === "true";
  console.log("\n--- X env (masked) ---");
  for (const key of X_KEYS) {
    const val = process.env[key];
    const set = val != null && String(val).trim() !== "";
    console.log(`  ${key}: ${set ? mask(val, showPeek) : "(not set)"}`);
  }
  console.log("---\n");

  const consumerKey = process.env.X_CONSUMER_KEY?.trim();
  const consumerSecret = process.env.X_CONSUMER_SECRET?.trim();
  const accessToken = process.env.X_ACCESS_TOKEN?.trim();
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET?.trim();
  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();
  const oauth1a = consumerKey && consumerSecret && accessToken && accessTokenSecret;
  const oauth2Fallback = clientId && clientSecret && !oauth1a;

  if (oauth1a) {
    console.log("Auth mode: OAuth 1.0a (X_CONSUMER_* + X_ACCESS_TOKEN/SECRET)");
  } else if (oauth2Fallback) {
    console.log("Auth mode: OAuth 2 fallback (X_CLIENT_SECRET as user token)");
  } else {
    console.log("Auth mode: MISSING credentials for posting");
    console.log("  Portal → Keys and tokens: X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET");
    process.exit(1);
  }
}

async function main() {
  const envFile = process.env.ENV_FILE || ".env.local";
  loadEnv(envFile);
  printEnvDebug();

  const require = createRequire(import.meta.url);
  const { TwitterApi } = require("twitter-api-v2");

  const consumerKey = process.env.X_CONSUMER_KEY?.trim();
  const consumerSecret = process.env.X_CONSUMER_SECRET?.trim();
  const accessToken = process.env.X_ACCESS_TOKEN?.trim();
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET?.trim();
  const clientId = process.env.X_CLIENT_ID?.trim();
  const clientSecret = process.env.X_CLIENT_SECRET?.trim();

  let client;
  if (consumerKey && consumerSecret && accessToken && accessTokenSecret) {
    client = new TwitterApi({
      appKey: consumerKey,
      appSecret: consumerSecret,
      accessToken,
      accessSecret: accessTokenSecret,
    });
  } else if (clientId && clientSecret) {
    client = new TwitterApi(clientSecret);
  } else {
    console.error("Missing credentials. Set X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET (portal Keys and tokens).");
    process.exit(1);
  }

  console.log("Calling X API v2.me()...");
  try {
    const me = await client.v2.me();
    const username = me.data?.username ?? "?";
    console.log("v2.me() OK. Logged in as: @" + username);

    const expected = (process.env.X_POST_AS_USERNAME || "atxbogart").trim().toLowerCase();
    if (username.toLowerCase() !== expected) {
      console.warn(`  Expected @${expected} (X_POST_AS_USERNAME). You are @${username}.`);
    }

    if (process.env.POST === "1" || process.env.POST === "true") {
      console.log("\nPosting test tweet...");
      const res = await client.v2.tweet("Hello from myInvestments CLI test");
      console.log("Posted:", "https://x.com/i/status/" + res.data.id);
    } else {
      console.log("\n(Set POST=1 to post a test tweet)");
    }
  } catch (e) {
    console.error("X API error:", e.message || e);
    if (e.code) console.error("  code:", e.code);
    if (e.data) console.error("  data:", JSON.stringify(e.data));
    process.exit(1);
  }
}

main();
