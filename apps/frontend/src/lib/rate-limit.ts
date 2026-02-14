/**
 * Centralized rate limiting for API routes.
 * When UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are set, uses Upstash Redis (multi-instance).
 * Otherwise uses in-memory store (rate-limiter-flexible).
 */

import { RateLimiterMemory } from "rate-limiter-flexible";
import type { NextRequest } from "next/server";

export type RateLimitResult =
  | { allowed: true; remaining: number; resetAt: number }
  | { allowed: false; retryAfter: number };

export function getClientIdentifier(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim();
  if (ip) return ip;
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}

const hasUpstash =
  typeof process.env.UPSTASH_REDIS_REST_URL === "string" &&
  process.env.UPSTASH_REDIS_REST_URL.length > 0 &&
  typeof process.env.UPSTASH_REDIS_REST_TOKEN === "string" &&
  process.env.UPSTASH_REDIS_REST_TOKEN.length > 0;

let upstashRedis: import("@upstash/redis").Redis | null = null;
const upstashLimiters: Record<string, import("@upstash/ratelimit").Ratelimit> = {};

async function getUpstashRatelimit(prefix: string, limit: number, windowSeconds: number): Promise<import("@upstash/ratelimit").Ratelimit> {
  if (upstashLimiters[prefix]) return upstashLimiters[prefix];
  const { Ratelimit } = await import("@upstash/ratelimit");
  const { Redis } = await import("@upstash/redis");
  if (!upstashRedis) {
    upstashRedis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  const ratelimit = new Ratelimit({
    redis: upstashRedis,
    limiter: Ratelimit.fixedWindow(limit, `${windowSeconds} s`),
    prefix: `rl:${prefix}:`,
  });
  upstashLimiters[prefix] = ratelimit;
  return ratelimit;
}

async function checkWithUpstash(
  prefix: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const ratelimit = await getUpstashRatelimit(prefix, limit, windowSeconds);
  const res = await ratelimit.limit(identifier);
  if (res.success) {
    const resetAt = res.reset * 1000;
    return { allowed: true, remaining: res.remaining, resetAt };
  }
  const retryAfter = Math.max(1, res.reset - Math.floor(Date.now() / 1000));
  return { allowed: false, retryAfter };
}

const CHAT_POINTS = 20;
const CHAT_DURATION = 60;
const IMPORT_POINTS = 10;
const IMPORT_DURATION = 60;
const CRON_POINTS = 6;
const CRON_DURATION = 3600;

const chatLimiter = new RateLimiterMemory({ points: CHAT_POINTS, duration: CHAT_DURATION });
const importLimiter = new RateLimiterMemory({ points: IMPORT_POINTS, duration: IMPORT_DURATION });
const cronLimiter = new RateLimiterMemory({ points: CRON_POINTS, duration: CRON_DURATION });

export async function checkChatRateLimit(request: NextRequest): Promise<RateLimitResult> {
  const id = getClientIdentifier(request);
  if (hasUpstash) return checkWithUpstash("chat", id, CHAT_POINTS, CHAT_DURATION);
  const key = `chat:${id}`;
  try {
    const res = await chatLimiter.consume(key);
    return { allowed: true, remaining: res.remainingPoints, resetAt: Date.now() + res.msBeforeNext };
  } catch (e: unknown) {
    const err = e as { msBeforeNext?: number };
    return { allowed: false, retryAfter: Math.ceil((err.msBeforeNext ?? 60_000) / 1000) };
  }
}

export async function checkImportRateLimit(request: NextRequest): Promise<RateLimitResult> {
  const id = getClientIdentifier(request);
  if (hasUpstash) return checkWithUpstash("import", id, IMPORT_POINTS, IMPORT_DURATION);
  const key = `import:${id}`;
  try {
    const res = await importLimiter.consume(key);
    return { allowed: true, remaining: res.remainingPoints, resetAt: Date.now() + res.msBeforeNext };
  } catch (e: unknown) {
    const err = e as { msBeforeNext?: number };
    return { allowed: false, retryAfter: Math.ceil((err.msBeforeNext ?? 60_000) / 1000) };
  }
}

export async function checkCronRateLimit(request: NextRequest): Promise<RateLimitResult> {
  const id = getClientIdentifier(request);
  if (hasUpstash) return checkWithUpstash("cron", id, CRON_POINTS, CRON_DURATION);
  const key = `cron:${id}`;
  try {
    const res = await cronLimiter.consume(key);
    return { allowed: true, remaining: res.remainingPoints, resetAt: Date.now() + res.msBeforeNext };
  } catch (e: unknown) {
    const err = e as { msBeforeNext?: number };
    return { allowed: false, retryAfter: Math.ceil((err.msBeforeNext ?? 3600) / 1000) };
  }
}
