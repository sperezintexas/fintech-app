/**
 * Server-side env. Builds ValidatedEnv from process.env with defaults.
 * No validation/throwing so CI build (e.g. without NEXTAUTH_SECRET) can succeed.
 */

type ServerEnvInput = {
  MONGODB_URI?: string;
  MONGODB_URI_B64?: string;
  MONGODB_DB?: string;
  NEXTAUTH_SECRET?: string;
  AUTH_SECRET?: string;
  NEXTAUTH_URL?: string;
  AUTH_URL?: string;
};

let validated: ValidatedEnv | null = null;

export type ValidatedEnv = {
  MONGODB_URI: string;
  MONGODB_DB: string;
  NEXTAUTH_SECRET: string;
  NEXTAUTH_URL: string;
  AUTH_URL: string;
  /** Optional: Slack webhook for alerts */
  SLACK_WEBHOOK_URL: string | undefined;
  /** Optional: X API keys (e.g. Grok chat). Auth uses X_CLIENT_ID / X_CLIENT_SECRET. */
  X_API_KEY: string | undefined;
  X_API_SECRET: string | undefined;
  /** Optional: X posting OAuth 1.0a app credentials (Consumer Key/Secret). X_CONSUMER_KEY/X_SECRET_KEY used for posting; X_API_KEY/X_API_SECRET for other use (e.g. Grok). */
  X_CONSUMER_KEY: string | undefined;
  X_SECRET_KEY: string | undefined;
  X_ACCESS_TOKEN: string | undefined;
  X_ACCESS_SECRET: string | undefined;
  X_CLIENT_ID: string | undefined;
  X_CLIENT_SECRET: string | undefined;
  /** Optional: Bearer token for X API posting (Authorization: Bearer). Auth uses X_CLIENT_ID / X_CLIENT_SECRET. */
  X_BEARER_TOKEN: string | undefined;
  /** Optional: OAuth 2.0 user access token for posting (alternative to X_BEARER_TOKEN). */
  X_OAUTH2_ACCESS_TOKEN: string | undefined;
};

function getMongoUriFromRaw(input: ServerEnvInput): string {
  if (input.MONGODB_URI) return input.MONGODB_URI;
  if (input.MONGODB_URI_B64) {
    return Buffer.from(input.MONGODB_URI_B64, "base64").toString("utf8");
  }
  return "mongodb://localhost:27017";
}

function buildValidatedEnv(raw: ServerEnvInput, fullEnv: NodeJS.ProcessEnv): ValidatedEnv {
  return {
    MONGODB_URI: getMongoUriFromRaw(raw),
    MONGODB_DB: raw.MONGODB_DB ?? "myinvestments",
    NEXTAUTH_SECRET: raw.NEXTAUTH_SECRET ?? raw.AUTH_SECRET ?? "",
    NEXTAUTH_URL: raw.NEXTAUTH_URL || raw.AUTH_URL || "http://localhost:3000",
    AUTH_URL: raw.AUTH_URL || raw.NEXTAUTH_URL || "http://localhost:3000",
    SLACK_WEBHOOK_URL: fullEnv.SLACK_WEBHOOK_URL,
    X_API_KEY: fullEnv.X_API_KEY,
    X_API_SECRET: fullEnv.X_API_SECRET,
    X_CONSUMER_KEY: fullEnv.X_CONSUMER_KEY,
    X_SECRET_KEY: fullEnv.X_SECRET_KEY,
    X_ACCESS_TOKEN: fullEnv.X_ACCESS_TOKEN,
    X_ACCESS_SECRET: fullEnv.X_ACCESS_SECRET,
    X_CLIENT_ID: fullEnv.X_CLIENT_ID,
    X_CLIENT_SECRET: fullEnv.X_CLIENT_SECRET,
    X_BEARER_TOKEN: fullEnv.X_BEARER_TOKEN,
    X_OAUTH2_ACCESS_TOKEN: fullEnv.X_OAUTH2_ACCESS_TOKEN,
  };
}

/**
 * Builds ValidatedEnv from env. Never throws; uses defaults for missing vars.
 */
export function validateServerEnv(env: NodeJS.ProcessEnv): ValidatedEnv {
  const raw: ServerEnvInput = {
    MONGODB_URI: env.MONGODB_URI,
    MONGODB_URI_B64: env.MONGODB_URI_B64,
    MONGODB_DB: env.MONGODB_DB,
    NEXTAUTH_SECRET: env.NEXTAUTH_SECRET,
    AUTH_SECRET: env.AUTH_SECRET,
    NEXTAUTH_URL: env.NEXTAUTH_URL,
    AUTH_URL: env.AUTH_URL,
  };
  return buildValidatedEnv(raw, env);
}

/**
 * Returns server env with defaults. Cached after first call.
 */
export function getEnv(): ValidatedEnv {
  if (validated) return validated;
  validated = validateServerEnv(process.env);
  return validated;
}

/**
 * Call once at startup (e.g. in instrumentation). Idempotent.
 */
export function ensureEnv(): ValidatedEnv {
  return getEnv();
}
