import { TwitterApi } from "twitter-api-v2";

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
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

export async function postToXTweet(rawText: string): Promise<{ id: string; text: string }> {
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
}
