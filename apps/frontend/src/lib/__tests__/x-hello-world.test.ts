/**
 * Hello-world X post test. Uses .env.local (or ENV_FILE) for credentials.
 * Run from repo root:
 *   pnpm run test:x-hello
 * Or with a specific env file:
 *   ENV_FILE=.env.prod pnpm run test:x-hello
 *
 * Skipped when RUN_X_HELLO is not set so CI does not attempt to post.
 */

import * as fs from "fs";
import * as path from "path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { postToXTweet } from "../x";

const RUN_X_HELLO = process.env.RUN_X_HELLO === "1" || process.env.RUN_X_HELLO === "true";

function loadEnvFile(): void {
  const envFile = process.env.ENV_FILE || ".env.local";
  const envPath = path.isAbsolute(envFile) ? envFile : path.join(process.cwd(), envFile);
  if (!fs.existsSync(envPath)) {
    throw new Error(`${envFile} not found at ${envPath}. Create it from .env.example and set OAuth credentials for posting (X_CONSUMER_KEY/SECRET + X_ACCESS_TOKEN/SECRET from portal Keys and tokens).`);
  }
  const content = fs.readFileSync(envPath, "utf-8");
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

describe("X hello world post", () => {
  beforeAll(() => {
    if (RUN_X_HELLO) loadEnvFile();
  });

  afterAll(() => {
    // no cleanup
  });

  test(
    "posts hello world to X when RUN_X_HELLO=1 and .env.local has credentials",
    { skip: !RUN_X_HELLO },
    async () => {
      if (!RUN_X_HELLO) return;
      const msg = "Hello world from myInvestments";
      const result = await postToXTweet(msg);
      expect(result).toBeDefined();
      expect(typeof result.id).toBe("string");
      expect(result.id.length).toBeGreaterThan(0);
      expect(typeof result.text).toBe("string");
      expect(result.text).toContain("Hello world");
      console.log(`Posted: https://x.com/i/status/${result.id}`);
    }
  );
});
