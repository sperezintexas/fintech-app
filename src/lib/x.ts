import { TwitterApi } from "twitter-api-v2";

type RateLimitError = Error & {
  code?: number;
  rateLimit?: { reset?: number };
  headers?: Record<string, string | string[] | undefined>;
};

function formatRateLimitError(e: RateLimitError): string {
  const raw = e.rateLimit?.reset ?? (e.headers?.["x-rate-limit-reset"] ?? e.headers?.["X-Rate-Limit-Reset"]);
  const resetSec =
    typeof raw === "number" ? raw : Array.isArray(raw) ? parseInt(raw[0] ?? "", 10) : parseInt(String(raw ?? ""), 10);
  if (!Number.isNaN(resetSec) && resetSec > 0) {
    const waitMin = Math.ceil((resetSec * 1000 - Date.now()) / 60000);
    return `X API rate limited. Try again in ~${Math.max(1, waitMin)} min`;
  }
  return "X API rate limited. Try again in ~15 min";
}

type XCredentials = {
  appKey: string;
  appSecret: string;
  accessToken: string;
  accessSecret: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function getXCredentials(): XCredentials {
  return {
    appKey: requireEnv("X_API_KEY"),
    appSecret: requireEnv("X_API_SECRET"),
    accessToken: requireEnv("X_ACCESS_TOKEN"),
    accessSecret: requireEnv("X_ACCESS_TOKEN_SECRET"),
  };
}

export function truncateForX(text: string, maxChars = 280): string {
  const clean = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** Split text into chunks ≤ maxChars, preferring newline boundaries. */
export function splitForXThread(text: string, maxChars = 280): string[] {
  const clean = text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];
  const chunks: string[] = [];
  let remaining = clean;
  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining.trim());
      break;
    }
    const slice = remaining.slice(0, maxChars);
    const lastNewline = slice.lastIndexOf("\n");
    const splitAt = lastNewline > 0 ? lastNewline + 1 : maxChars;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trimStart();
  }
  return chunks.filter((c) => c.length > 0);
}

export async function postToXTweet(rawText: string): Promise<{ id: string; text: string }> {
  try {
    const creds = getXCredentials();
    const client = new TwitterApi({
      appKey: creds.appKey,
      appSecret: creds.appSecret,
      accessToken: creds.accessToken,
      accessSecret: creds.accessSecret,
    });

    const text = truncateForX(rawText, 280);
    const res = await client.v2.tweet(text);
    return { id: res.data.id, text: res.data.text };
  } catch (e) {
    const err = e as RateLimitError & { rateLimitError?: boolean };
    if (err?.code === 429 || err?.code === 420 || err?.rateLimitError)
      throw new Error(formatRateLimitError(err));
    throw e;
  }
}

/** Post full text as a thread (multiple tweets). No truncation. */
export async function postToXThread(rawText: string): Promise<{ ids: string[] }> {
  const chunks = splitForXThread(rawText, 280);
  if (chunks.length === 0) return { ids: [] };
  if (chunks.length === 1) {
    const res = await postToXTweet(chunks[0]!);
    return { ids: [res.id] };
  }
  try {
    const creds = getXCredentials();
    const client = new TwitterApi({
      appKey: creds.appKey,
      appSecret: creds.appSecret,
      accessToken: creds.accessToken,
      accessSecret: creds.accessSecret,
    });
    const results = await client.v2.tweetThread(chunks);
    return { ids: results.map((r) => r.data.id) };
  } catch (e) {
    const err = e as RateLimitError & { rateLimitError?: boolean };
    if (err?.code === 429 || err?.code === 420 || err?.rateLimitError)
      throw new Error(formatRateLimitError(err));
    throw e;
  }
}
