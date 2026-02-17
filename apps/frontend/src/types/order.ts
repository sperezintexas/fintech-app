import { z } from "zod";

/** NL-parsed order actions (aligned with analyzer recommendation actions). */
export const ORDER_ACTIONS = [
  "BUY_TO_CLOSE",
  "SELL_TO_CLOSE",
  "SELL_NEW_CALL",
  "BUY_NEW_PUT",
  "ROLL",
  "HOLD",
  "NONE",
] as const;

export type OrderAction = (typeof ORDER_ACTIONS)[number];

export const orderActionSchema = z.enum(ORDER_ACTIONS);

/** Option type for a leg. */
export const optionTypeSchema = z.enum(["call", "put"]);
export type OrderOptionType = z.infer<typeof optionTypeSchema>;

/** Parsed order from natural language (Grok output validated by Zod). */
export type ParsedOrder = {
  action: OrderAction;
  ticker: string;
  optionType?: OrderOptionType;
  strike?: number;
  /** YYYY-MM-DD or relative e.g. "next Friday" normalized to date */
  expiration?: string;
  contracts?: number;
  /** Optional: for ROLL, the new strike/expiry */
  rollToStrike?: number;
  rollToExpiration?: string;
  reason?: string;
};

export const parsedOrderSchema = z.object({
  action: orderActionSchema,
  ticker: z.string().min(1).max(10).transform((s) => s.toUpperCase()),
  optionType: optionTypeSchema.optional(),
  strike: z.number().positive().optional(),
  expiration: z.string().max(20).optional(),
  contracts: z.number().int().min(1).max(100).optional(),
  rollToStrike: z.number().positive().optional(),
  rollToExpiration: z.string().max(20).optional(),
  reason: z.string().max(500).optional(),
});

export type OrderParseError = {
  code: "PARSE_FAILED" | "VALIDATION_FAILED" | "GROK_ERROR";
  message: string;
  raw?: unknown;
};

/** Result of NL parse: either valid order or error. */
export type ParseOrderResult =
  | { ok: true; order: ParsedOrder }
  | { ok: false; error: OrderParseError };
