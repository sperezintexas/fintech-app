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

/** Posting uses OAuth only (X_OAUTH2_ACCESS_TOKEN or OAuth 1.0a). X_BEARER_TOKEN is ignored for posting. Verifies posting as X_POST_AS_USERNAME (default atxbogart). */
async function getXClient(): Promise<TwitterApi> {
  if (cachedClient) return cachedClient;
  if (clientPromise) return clientPromise;

  clientPromise = (async (): Promise<TwitterApi> => {
    const oauth2Token = process.env.X_OAUTH2_ACCESS_TOKEN?.trim();
    // Posting: use X_CONSUMER_KEY/X_SECRET_KEY (OAuth 1.0a for X). X_API_KEY/X_API_SECRET are for Grok chat, not posting.
    const appKey = process.env.X_CONSUMER_KEY || process.env.X_API_KEY;
    const appSecret = process.env.X_SECRET_KEY || process.env.X_API_SECRET;
    const accessToken = process.env.X_ACCESS_TOKEN;
    const accessSecret = process.env.X_ACCESS_TOKEN_SECRET || process.env.X_ACCESS_SECRET;
    let client: TwitterApi;
    if (oauth2Token) {
      client = new TwitterApi(oauth2Token);
    } else if (appKey && appSecret && accessToken && accessSecret) {
      client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret });
    } else {
      throw new Error(
        "Missing X credentials for posting. Set X_OAUTH2_ACCESS_TOKEN (OAuth 2.0) or X_CONSUMER_KEY, X_SECRET_KEY, X_ACCESS_TOKEN, X_ACCESS_SECRET (OAuth 1.0a for X). X_API_KEY/X_API_SECRET are for Grok chat."
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
        "X API 403 Forbidden: Bearer token is app-only (read-only). To post, use OAuth 1.0a (X_CONSUMER_KEY, X_SECRET_KEY, X_ACCESS_TOKEN, X_ACCESS_SECRET) or OAuth 2.0 user token."
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
