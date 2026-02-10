/**
 * Zod validation schemas for API routes.
 *
 * Centralized input validation to prevent injection attacks and ensure data integrity.
 * Always validate user input before using it in database queries or business logic.
 */

import { z } from "zod";

// ============================================================================
// Common Schemas
// ============================================================================

/**
 * MongoDB ObjectId string format validation.
 */
export const objectIdSchema = z
  .string()
  .length(24)
  .regex(/^[a-f\d]{24}$/i, "Invalid ObjectId format");

/**
 * Stock ticker symbol validation (1-5 uppercase letters).
 */
export const tickerSymbolSchema = z
  .string()
  .min(1)
  .max(5)
  .regex(/^[A-Z]+$/i, "Invalid ticker symbol")
  .transform((s) => s.toUpperCase());

/**
 * Option symbol validation (e.g., TSLA260320C00005000).
 */
export const optionSymbolSchema = z
  .string()
  .min(15)
  .max(21)
  .regex(/^[A-Z]{1,5}\d{6}[CP]\d{8}$/i, "Invalid option symbol format")
  .transform((s) => s.toUpperCase());

/**
 * Combined stock or option symbol.
 */
export const symbolSchema = z.union([tickerSymbolSchema, optionSymbolSchema]);

/**
 * Email validation.
 */
export const emailSchema = z
  .string()
  .email("Invalid email format")
  .max(254)
  .transform((s) => s.toLowerCase().trim());

/**
 * Safe string that rejects MongoDB operators.
 */
export const safeStringSchema = z
  .string()
  .refine(
    (val) => !val.includes("$") && !val.includes("{") && !val.includes("}"),
    "Invalid characters in input"
  );

/**
 * Pagination parameters.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// Account Schemas
// ============================================================================

export const riskLevelSchema = z.enum(["low", "medium", "high"]);

export const strategySchema = z.enum([
  "growth",
  "income",
  "balanced",
  "aggressive",
]);

export const brokerTypeSchema = z.enum(["Merrill", "Fidelity"]);

export const createAccountSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name too long")
    .transform((s) => s.trim()),
  accountRef: z
    .string()
    .max(50)
    .transform((s) => s.trim())
    .optional(),
  brokerType: brokerTypeSchema.optional(),
  balance: z.coerce.number().min(0).default(0),
  riskLevel: riskLevelSchema.default("medium"),
  strategy: strategySchema.default("balanced"),
});

export const updateAccountSchema = createAccountSchema.partial();

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

// ============================================================================
// Position Schemas
// ============================================================================

export const positionTypeSchema = z.enum(["stock", "option", "cash"]);

export const optionTypeSchema = z.enum(["call", "put"]);

export const createPositionSchema = z.object({
  accountId: objectIdSchema,
  ticker: tickerSymbolSchema.optional(),
  type: positionTypeSchema,
  shares: z.coerce.number().min(0).optional(),
  purchasePrice: z.coerce.number().min(0).optional(),
  purchaseDate: z.string().datetime().optional(),
  optionType: optionTypeSchema.optional(),
  strikePrice: z.coerce.number().min(0).optional(),
  expirationDate: z.string().optional(),
  premium: z.coerce.number().min(0).optional(),
  contracts: z.coerce.number().int().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

export const updatePositionSchema = createPositionSchema.partial().omit({
  accountId: true,
});

export type CreatePositionInput = z.infer<typeof createPositionSchema>;
export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;

// ============================================================================
// Watchlist Schemas
// ============================================================================

export const watchlistStrategySchema = z.enum([
  "covered-call",
  "cash-secured-put",
  "leap-call",
  "wheel",
  "stock",
  "collar",
  "straddle",
  "strangle",
]);

export const createWatchlistItemSchema = z.object({
  watchlistId: objectIdSchema,
  accountId: objectIdSchema.optional(),
  symbol: tickerSymbolSchema,
  underlyingSymbol: tickerSymbolSchema.optional(),
  type: positionTypeSchema,
  strategy: watchlistStrategySchema,
  quantity: z.coerce.number().int().min(1).max(10000),
  entryPrice: z.coerce.number().min(0),
  entryDate: z.string().optional(),
  strikePrice: z.coerce.number().min(0).optional(),
  expirationDate: z.string().optional(),
  entryPremium: z.coerce.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
});

export type CreateWatchlistItemInput = z.infer<typeof createWatchlistItemSchema>;

// ============================================================================
// Alert Schemas
// ============================================================================

export const alertTypeSchema = z.enum([
  "price",
  "option-scanner",
  "risk-scanner",
  "covered-call",
  "protective-put",
  "daily-analysis",
]);

export const alertDeliveryChannelSchema = z.enum([
  "slack",
  "twitter",
  "push",
  "email",
]);

export const createAlertSchema = z.object({
  type: alertTypeSchema,
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(5000),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  symbol: tickerSymbolSchema.optional(),
  watchlistItemId: objectIdSchema.optional(),
  accountId: objectIdSchema.optional(),
  data: z.record(z.unknown()).optional(),
});

export const acknowledgeAlertSchema = z.object({
  acknowledged: z.boolean(),
});

export type CreateAlertInput = z.infer<typeof createAlertSchema>;

// ============================================================================
// Alert Preferences Schemas
// ============================================================================

export const alertChannelConfigSchema = z.object({
  channel: alertDeliveryChannelSchema,
  target: z.string().min(1).max(500),
  enabled: z.boolean().default(true),
});

export const alertPreferencesSchema = z.object({
  accountId: objectIdSchema,
  channels: z.array(alertChannelConfigSchema).max(10),
  quietHoursStart: z.string().optional(), // HH:mm format
  quietHoursEnd: z.string().optional(),
  timezone: z.string().max(50).optional(),
});

export type AlertPreferencesInput = z.infer<typeof alertPreferencesSchema>;

// ============================================================================
// Chat Schemas
// ============================================================================

export const chatMessageSchema = z.object({
  message: z
    .string()
    .min(1, "Message is required")
    .max(2000, "Message too long"),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(10000),
      })
    )
    .max(50)
    .optional(),
  orderContext: z
    .object({
      symbol: tickerSymbolSchema.optional(),
      strike: z.coerce.number().min(0).optional(),
      expiration: z.string().optional(),
      credit: z.coerce.number().optional(),
      quantity: z.coerce.number().int().min(1).optional(),
      probOtm: z.coerce.number().min(0).max(100).optional(),
    })
    .optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;

// ============================================================================
// Job/Scheduler Schemas
// ============================================================================

export const cronExpressionSchema = z
  .string()
  .min(9)
  .max(100)
  .refine(
    (val) => {
      // Basic cron validation (5 or 6 fields)
      const parts = val.trim().split(/\s+/);
      return parts.length >= 5 && parts.length <= 6;
    },
    "Invalid cron expression"
  );

export const createJobSchema = z.object({
  name: z.string().min(1).max(100),
  jobType: z.string().min(1).max(50),
  schedule: cronExpressionSchema.optional(),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

// ============================================================================
// Access Key Schemas
// ============================================================================

export const createAccessKeySchema = z.object({
  name: z.string().min(1).max(100).transform((s) => s.trim()),
});

export type CreateAccessKeyInput = z.infer<typeof createAccessKeySchema>;

// ============================================================================
// Report Schemas
// ============================================================================

export const reportTypeIdSchema = z
  .string()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z][a-zA-Z0-9_-]*$/, "Invalid report type ID format");

export const createReportTypeSchema = z.object({
  id: reportTypeIdSchema,
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  handler: z.string().min(1).max(50),
  defaultConfig: z.record(z.unknown()).optional(),
  enabled: z.boolean().default(true),
});

export type CreateReportTypeInput = z.infer<typeof createReportTypeSchema>;

// ============================================================================
// Import Schemas
// ============================================================================

export const brokerImportSchema = z.object({
  broker: z.enum(["merrill", "fidelity"]).default("merrill"),
  exportType: z.enum(["activities", "holdings"]).default("activities"),
  csv: z.string().min(1, "CSV data is required").max(10_000_000, "CSV too large (max 10MB)"),
  mappings: z.record(z.string()).optional(),
  recomputePositions: z.boolean().default(true),
  fidelityHoldingsDefaultAccountRef: z.string().max(50).optional(),
});

export const csvImportSchema = z.object({
  accountId: objectIdSchema,
  csv: z.string().min(1, "CSV data is required").max(10_000_000, "CSV too large (max 10MB)"),
  format: z.enum(["generic", "fidelity", "schwab"]).default("generic"),
  recomputePositions: z.boolean().default(true),
});

export type BrokerImportInput = z.infer<typeof brokerImportSchema>;
export type CsvImportInput = z.infer<typeof csvImportSchema>;

// ============================================================================
// Console/XTools Schemas (Admin operations)
// ============================================================================

export const consoleOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("listCollections") }),
  z.object({
    op: z.literal("find"),
    collection: z.string().min(1),
    filter: z.record(z.unknown()).optional(),
    limit: z.number().int().min(1).max(500).optional(),
  }),
  z.object({
    op: z.literal("count"),
    collection: z.string().min(1),
    filter: z.record(z.unknown()).optional(),
  }),
  z.object({
    op: z.literal("deleteMany"),
    collection: z.string().min(1),
    filter: z.record(z.unknown()),
  }),
  z.object({
    op: z.literal("updateMany"),
    collection: z.string().min(1),
    filter: z.record(z.unknown()),
    update: z.record(z.unknown()),
  }),
]);

export type ConsoleOpInput = z.infer<typeof consoleOpSchema>;

// ============================================================================
// Query Parameter Schemas
// ============================================================================

export const accountIdQuerySchema = z.object({
  accountId: objectIdSchema.optional(),
});

export const watchlistQuerySchema = z.object({
  watchlistId: objectIdSchema.optional(),
  accountId: objectIdSchema.optional(),
});

export const alertsQuerySchema = z.object({
  accountId: objectIdSchema.optional(),
  type: alertTypeSchema.optional(),
  acknowledged: z
    .string()
    .optional()
    .transform((v) => (v === "true" ? true : v === "false" ? false : undefined)),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Parse and validate request body with a Zod schema.
 * Returns typed result or throws ZodError.
 */
export function parseBody<T extends z.ZodType>(
  schema: T,
  body: unknown
): z.infer<T> {
  return schema.parse(body);
}

/**
 * Safe parse that returns null instead of throwing.
 */
export function safeParseBody<T extends z.ZodType>(
  schema: T,
  body: unknown
): z.infer<T> | null {
  const result = schema.safeParse(body);
  return result.success ? result.data : null;
}

/**
 * Parse URL search params with a Zod schema.
 */
export function parseSearchParams<T extends z.ZodType>(
  schema: T,
  searchParams: URLSearchParams
): z.infer<T> {
  const params: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return schema.parse(params);
}

/**
 * Format Zod errors into a user-friendly message.
 */
export function formatZodErrors(error: z.ZodError): string {
  return error.errors
    .map((e) => `${e.path.join(".")}: ${e.message}`)
    .join("; ");
}
