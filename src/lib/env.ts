/**
 * Server-side env validation. Validates at first use and throws with a clear
 * message if any required var is missing. Keeps optional vars (Slack, X, etc.)
 * optional so dev/local doesn't require them.
 */

import { z } from "zod";

const serverEnvSchema = z.object({
  MONGODB_URI: z.string().min(1).optional(),
  MONGODB_URI_B64: z.string().min(1).optional(),
  MONGODB_DB: z.string().min(1).optional(),
  NEXTAUTH_SECRET: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1).optional(),
  NEXTAUTH_URL: z.string().url().optional().or(z.literal("")),
  AUTH_URL: z.string().url().optional().or(z.literal("")),
}).refine(
  (data) => (data.MONGODB_URI?.length ?? 0) > 0 || (data.MONGODB_URI_B64?.length ?? 0) > 0,
  { message: "Either MONGODB_URI or MONGODB_URI_B64 must be set", path: ["MONGODB_URI"] }
).refine(
  (data) => (data.NEXTAUTH_SECRET?.length ?? 0) > 0 || (data.AUTH_SECRET?.length ?? 0) > 0,
  { message: "NEXTAUTH_SECRET or AUTH_SECRET must be set", path: ["NEXTAUTH_SECRET"] }
);

export type ServerEnvInput = z.infer<typeof serverEnvSchema>;

let validated: ValidatedEnv | null = null;

export type ValidatedEnv = {
  MONGODB_URI: string;
  MONGODB_DB: string;
  NEXTAUTH_SECRET: string;
  NEXTAUTH_URL: string;
  AUTH_URL: string;
  /** Optional: Slack webhook for alerts */
  SLACK_WEBHOOK_URL: string | undefined;
  /** Optional: X/Twitter API keys for alerts */
  X_API_KEY: string | undefined;
  X_API_SECRET: string | undefined;
  X_ACCESS_TOKEN: string | undefined;
  X_ACCESS_SECRET: string | undefined;
  X_CLIENT_ID: string | undefined;
  X_CLIENT_SECRET: string | undefined;
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
    X_ACCESS_TOKEN: fullEnv.X_ACCESS_TOKEN,
    X_ACCESS_SECRET: fullEnv.X_ACCESS_SECRET,
    X_CLIENT_ID: fullEnv.X_CLIENT_ID,
    X_CLIENT_SECRET: fullEnv.X_CLIENT_SECRET,
  };
}

/**
 * Validates a given env object and returns ValidatedEnv. Throws with message
 * containing the var name if required vars are missing. Used by getEnv() and by tests.
 */
export function validateServerEnv(env: NodeJS.ProcessEnv): ValidatedEnv {
  const parsed = serverEnvSchema.safeParse(env);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    const msg = first?.message ?? parsed.error.message;
    const path = first?.path?.join(".") ?? "env";
    throw new Error(`Env validation failed: ${path} — ${msg}`);
  }
  return buildValidatedEnv(parsed.data, env);
}

/**
 * Validates server env and returns the validated object. Throws on first call
 * if any required var is missing, with message containing the var name.
 * Subsequent calls return the same cached object.
 */
export function getEnv(): ValidatedEnv {
  if (validated) return validated;
  validated = validateServerEnv(process.env);
  return validated;
}

/**
 * Call once at startup (e.g. in instrumentation) to crash early if env is invalid.
 * Idempotent; safe to call multiple times.
 */
export function ensureEnv(): ValidatedEnv {
  return getEnv();
}
