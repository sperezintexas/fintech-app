/**
 * Security utilities for input validation, sanitization, and injection prevention.
 *
 * This module provides defense-in-depth against:
 * - NoSQL injection attacks
 * - XSS (Cross-Site Scripting)
 * - Command injection
 * - Path traversal
 */

import { ObjectId } from "mongodb";

// ============================================================================
// NoSQL Injection Prevention
// ============================================================================

/**
 * MongoDB operator patterns that could be used for injection attacks.
 * These should never appear in user-provided values used in queries.
 */
const MONGODB_OPERATORS = [
  "$gt",
  "$gte",
  "$lt",
  "$lte",
  "$eq",
  "$ne",
  "$in",
  "$nin",
  "$and",
  "$or",
  "$not",
  "$nor",
  "$exists",
  "$type",
  "$expr",
  "$regex",
  "$where",
  "$text",
  "$search",
  "$mod",
  "$all",
  "$size",
  "$elemMatch",
  "$slice",
  "$meta",
  "$comment",
  "$rand",
  "$natural",
  "$currentDate",
  "$inc",
  "$min",
  "$max",
  "$mul",
  "$rename",
  "$set",
  "$setOnInsert",
  "$unset",
  "$addToSet",
  "$pop",
  "$pull",
  "$push",
  "$pullAll",
  "$each",
  "$position",
  "$sort",
  "$bit",
];

/**
 * Check if a value contains MongoDB operators (potential injection).
 */
export function containsMongoOperators(value: unknown): boolean {
  if (typeof value === "string") {
    return MONGODB_OPERATORS.some((op) => value.includes(op));
  }
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value);
    return keys.some((key) => key.startsWith("$"));
  }
  return false;
}

/**
 * Sanitize a value for safe use in MongoDB queries.
 * Removes or escapes potentially dangerous operators.
 *
 * @param value - The value to sanitize
 * @returns Sanitized value safe for MongoDB queries
 * @throws Error if value contains injection patterns and cannot be sanitized
 */
export function sanitizeMongoValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    // Check for MongoDB operators in string
    if (containsMongoOperators(value)) {
      throw new Error("Invalid input: contains potential injection patterns");
    }
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMongoValue(item)) as T;
  }

  if (typeof value === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      // Reject keys starting with $
      if (key.startsWith("$")) {
        throw new Error(`Invalid input: operator "${key}" not allowed in query`);
      }
      sanitized[key] = sanitizeMongoValue(val);
    }
    return sanitized as T;
  }

  return value;
}

/**
 * Validate and sanitize a MongoDB ObjectId string.
 *
 * @param id - The ID string to validate
 * @returns Valid ObjectId or null if invalid
 */
export function sanitizeObjectId(id: string | null | undefined): ObjectId | null {
  if (!id || typeof id !== "string") {
    return null;
  }

  // Remove any whitespace
  const trimmed = id.trim();

  // Check if it's a valid ObjectId format
  if (!ObjectId.isValid(trimmed)) {
    return null;
  }

  // Additional check: the string representation should match
  const objectId = new ObjectId(trimmed);
  if (objectId.toString() !== trimmed) {
    return null;
  }

  return objectId;
}

/**
 * Safely build a MongoDB query filter from user input.
 *
 * @param filters - Object containing filter key-value pairs
 * @param allowedFields - List of fields that can be filtered
 * @returns Sanitized query filter
 */
export function buildSafeQuery(
  filters: Record<string, unknown>,
  allowedFields: string[]
): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(filters)) {
    // Only allow specified fields
    if (!allowedFields.includes(key)) {
      continue;
    }

    // Skip null/undefined values
    if (value === null || value === undefined || value === "") {
      continue;
    }

    // Sanitize the value
    query[key] = sanitizeMongoValue(value);
  }

  return query;
}

// ============================================================================
// XSS Prevention
// ============================================================================

/**
 * HTML entities to escape for XSS prevention.
 */
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
  "/": "&#x2F;",
  "`": "&#x60;",
  "=": "&#x3D;",
};

/**
 * Escape HTML entities to prevent XSS attacks.
 *
 * @param input - String to escape
 * @returns Escaped string safe for HTML output
 */
export function escapeHtml(input: string): string {
  if (typeof input !== "string") {
    return "";
  }
  return input.replace(/[&<>"'`=/]/g, (char) => HTML_ESCAPE_MAP[char] || char);
}

/**
 * Strip HTML tags from a string.
 *
 * @param input - String potentially containing HTML
 * @returns String with HTML tags removed
 */
export function stripHtml(input: string): string {
  if (typeof input !== "string") {
    return "";
  }
  return input.replace(/<[^>]*>/g, "");
}

/**
 * Sanitize user input for safe display.
 * Combines HTML escaping and length limiting.
 *
 * @param input - User input to sanitize
 * @param maxLength - Maximum allowed length (default: 10000)
 * @returns Sanitized string
 */
export function sanitizeUserInput(input: string, maxLength = 10000): string {
  if (typeof input !== "string") {
    return "";
  }

  // Trim and limit length
  let sanitized = input.trim().slice(0, maxLength);

  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");

  // Normalize unicode (prevent homograph attacks)
  sanitized = sanitized.normalize("NFKC");

  return sanitized;
}

// ============================================================================
// Path Traversal Prevention
// ============================================================================

/**
 * Sanitize a file path to prevent directory traversal attacks.
 *
 * @param path - The path to sanitize
 * @returns Sanitized path or null if invalid
 */
export function sanitizePath(path: string): string | null {
  if (typeof path !== "string") {
    return null;
  }

  // Remove null bytes
  let sanitized = path.replace(/\0/g, "");

  // Normalize path separators
  sanitized = sanitized.replace(/\\/g, "/");

  // Check for path traversal patterns
  if (
    sanitized.includes("..") ||
    sanitized.includes("//") ||
    sanitized.startsWith("/") ||
    /^[a-zA-Z]:/.test(sanitized) // Windows absolute paths
  ) {
    return null;
  }

  return sanitized;
}

// ============================================================================
// Input Validation Helpers
// ============================================================================

/**
 * Validate an email address format.
 */
export function isValidEmail(email: string): boolean {
  if (typeof email !== "string") return false;
  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Validate a stock ticker symbol format.
 */
export function isValidTickerSymbol(symbol: string): boolean {
  if (typeof symbol !== "string") return false;
  // Standard ticker: 1-5 uppercase letters
  // Option symbol: up to ~21 chars (e.g., TSLA260320C00005000)
  return /^[A-Z]{1,5}$/.test(symbol) || /^[A-Z]{1,5}\d{6}[CP]\d{8}$/.test(symbol);
}

/**
 * Validate a URL format.
 */
export function isValidUrl(url: string): boolean {
  if (typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate a UUID format.
 */
export function isValidUuid(uuid: string): boolean {
  if (typeof uuid !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// ============================================================================
// Rate Limiting Helpers
// ============================================================================

/**
 * Simple in-memory rate limiter.
 * For production, use Redis or a dedicated rate limiting service.
 */
export class RateLimiter {
  private store = new Map<string, { count: number; resetAt: number }>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs = 60000, maxRequests = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Cleanup old entries periodically
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of this.store.entries()) {
        if (now > value.resetAt) {
          this.store.delete(key);
        }
      }
    }, windowMs);
  }

  /**
   * Check if a request should be allowed.
   *
   * @param key - Identifier for the client (e.g., IP address)
   * @returns Object with allowed status and remaining requests
   */
  check(key: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || now > entry.resetAt) {
      const resetAt = now + this.windowMs;
      this.store.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: this.maxRequests - 1, resetAt };
    }

    entry.count++;
    const allowed = entry.count <= this.maxRequests;
    return {
      allowed,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetAt: entry.resetAt,
    };
  }

  /**
   * Reset the rate limit for a key.
   */
  reset(key: string): void {
    this.store.delete(key);
  }
}

// ============================================================================
// CSRF Token Utilities
// ============================================================================

/**
 * Generate a CSRF token.
 * In production, use a cryptographically secure implementation.
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate a CSRF token using timing-safe comparison.
 */
export function validateCsrfToken(token: string, expected: string): boolean {
  if (typeof token !== "string" || typeof expected !== "string") {
    return false;
  }

  if (token.length !== expected.length) {
    return false;
  }

  // Timing-safe comparison
  let result = 0;
  for (let i = 0; i < token.length; i++) {
    result |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

// ============================================================================
// Logging Security Events
// ============================================================================

export type SecurityEventType =
  | "auth_failure"
  | "rate_limit_exceeded"
  | "injection_attempt"
  | "invalid_input"
  | "unauthorized_access"
  | "suspicious_activity";

export type SecurityEvent = {
  type: SecurityEventType;
  message: string;
  ip?: string;
  userId?: string;
  path?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
};

/**
 * Log a security event.
 * In production, send to a security monitoring service (SIEM).
 */
export function logSecurityEvent(event: Omit<SecurityEvent, "timestamp">): void {
  const fullEvent: SecurityEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  // Log to console with security prefix for easy filtering
  console.warn("[SECURITY]", JSON.stringify(fullEvent));

  // In production, you would:
  // - Send to a SIEM (Splunk, Datadog, etc.)
  // - Store in a security events collection
  // - Trigger alerts for critical events
}
