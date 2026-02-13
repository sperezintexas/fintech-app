import { TwitterApi } from "twitter-api-v2";

/** Account to post as; credentials in .env must be for this user. */
export const X_POST_AS_USERNAME = process.env.X_POST_AS_USERNAME?.trim() || "atxbogart";

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

let cachedClient: TwitterApi | null = null;
let clientPromise: Promise<TwitterApi> | null = null;

/** Posting uses OAuth 1.0a (consumer + access token from portal) or fallback OAuth 2. X_BEARER_TOKEN is ignored for posting. Verifies posting as X_POST_AS_USERNAME (default atxbogart). */
async function getXClient(): Promise<TwitterApi> {
  if (cachedClient) return cachedClient;
  if (clientPromise) return clientPromise;

  clientPromise = (async (): Promise<TwitterApi> => {
    const consumerKey = process.env.X_CONSUMER_KEY?.trim();
    const consumerSecret = process.env.X_CONSUMER_SECRET?.trim();
    const accessToken = process.env.X_ACCESS_TOKEN?.trim();
    const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET?.trim();
    const clientId = process.env.X_CLIENT_ID?.trim();
    const clientSecret = process.env.X_CLIENT_SECRET?.trim();
    let client: TwitterApi;
    if (consumerKey && consumerSecret && accessToken && accessTokenSecret) {
      // OAuth 1.0a: consumer (app) + access token (user) — from portal Keys and tokens.
      client = new TwitterApi({
        appKey: consumerKey,
        appSecret: consumerSecret,
        accessToken,
        accessSecret: accessTokenSecret,
      });
    } else if (clientId && clientSecret) {
      // Fallback: OAuth 2 user token (clientSecret as single token if you have one).
      client = new TwitterApi(clientSecret);
    } else {
      throw new Error(
        "Missing X posting credentials. In portal Keys and tokens set: X_CONSUMER_KEY, X_CONSUMER_SECRET (API Key/Secret), X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET (Authentication Tokens, Read and write)."
      );
    }
    let me: { data?: { username?: string } };
    try {
      me = await client.v2.me();
    } catch (e: unknown) {
      const err = e as { code?: number; message?: string };
      if (err?.code === 401) {
        throw new Error(
          "X API 401 Unauthorized: token invalid or expired. Check credentials in .env.local."
        );
      }
      throw e;
    }
    const username = (me.data?.username ?? "").toLowerCase();
    const expected = X_POST_AS_USERNAME.toLowerCase();
    if (username !== expected) {
      throw new Error(
        `X credentials post as @${me.data?.username ?? "unknown"}; expected @${X_POST_AS_USERNAME}. Use tokens for @${X_POST_AS_USERNAME}.`
      );
    }
    cachedClient = client;
    return client;
  })().catch((e) => {
    clientPromise = null;
    throw e;
  });

  return clientPromise;
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
    const client = await getXClient();
    const text = truncateForX(rawText, 280);
    const res = await client.v2.tweet(text);
    return { id: res.data.id, text: res.data.text };
  } catch (e) {
    const err = e as RateLimitError & { rateLimitError?: boolean; code?: number };
    if (err?.code === 429 || err?.code === 420 || err?.rateLimitError)
      throw new Error(formatRateLimitError(err));
    if (err?.code === 403) {
      throw new Error(
        "X API 403 Forbidden: Bearer token is app-only (read-only). To post, set X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET (portal Keys and tokens)."
      );
    }
    throw e;
  }
}

/** Max tweets per thread to avoid rate limits and API errors. */
const MAX_TWEETS_PER_THREAD = 5;

/** Post full text as a thread (multiple tweets). Truncates to MAX_TWEETS_PER_THREAD chunks. */
export async function postToXThread(rawText: string): Promise<{ ids: string[] }> {
  const chunks = splitForXThread(rawText, 280);
  if (chunks.length === 0) return { ids: [] };
  const toPost = chunks.length > MAX_TWEETS_PER_THREAD ? chunks.slice(0, MAX_TWEETS_PER_THREAD) : chunks;
  if (toPost.length === 1) {
    const res = await postToXTweet(toPost[0]!);
    return { ids: [res.id] };
  }
  try {
    const client = await getXClient();
    const results = await client.v2.tweetThread(toPost);
    return { ids: results.map((r) => r.data.id) };
  } catch (e) {
    const err = e as RateLimitError & { rateLimitError?: boolean; code?: number };
    if (err?.code === 429 || err?.code === 420 || err?.rateLimitError)
      throw new Error(formatRateLimitError(err));
    if (err?.code === 403) {
      throw new Error(
        "X API 403 Forbidden: Bearer token is app-only (read-only). To post, use OAuth 1.0a or OAuth 2.0 user token."
      );
    }
    throw e;
  }
}
