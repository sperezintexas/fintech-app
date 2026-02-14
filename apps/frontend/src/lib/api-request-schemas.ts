/**
 * Zod schemas for API request body validation.
 * Use .safeParse(body) and return 400 with .error.flatten() when invalid.
 */

import { z } from "zod";

/** POST /api/auth/validate-credentials: key OR email+password */
export const validateCredentialsBodySchema = z
  .object({
    key: z.string().min(1).max(512).optional(),
    email: z.string().email().max(320).optional(),
    password: z.string().min(1).max(1024).optional(),
  })
  .refine(
    (data) => {
      if (data.key) return true;
      if (data.email && data.password) return true;
      return false;
    },
    { message: "Either key or both email and password are required" }
  );

/** POST /api/chat: message and optional history/persona */
export const chatPostBodySchema = z.object({
  message: z.string().min(1).max(2000).trim(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .max(50)
    .optional(),
  persona: z.string().max(200).optional(),
  orderContext: z
    .object({
      symbol: z.string().max(10).optional(),
      strike: z.number().optional(),
      expiration: z.string().max(20).optional(),
      credit: z.number().optional(),
      quantity: z.number().optional(),
      probOtm: z.number().optional(),
    })
    .optional(),
});

export type ChatPostBody = z.infer<typeof chatPostBodySchema>;

/** POST /api/jobs: required name, jobType, scheduleCron; config validated by validateJobConfig */
export const jobsPostBodySchema = z.object({
  accountId: z.union([z.string(), z.null()]).optional(),
  name: z.string().min(1).max(256).trim(),
  jobType: z.string().min(1).max(64).trim(),
  scheduleCron: z.string().min(1).max(128).trim(),
  messageTemplate: z.string().max(8000).optional(),
  config: z.record(z.unknown()).optional(),
  templateId: z.string().max(64).optional(),
  customSlackTemplate: z.string().max(16000).optional(),
  customXTemplate: z.string().max(16000).optional(),
  scannerConfig: z.record(z.unknown()).optional(),
  channels: z.array(z.string().max(64)).optional(),
  deliveryChannels: z.array(z.string().max(64)).optional(),
  status: z.enum(["active", "paused"]).optional(),
});
