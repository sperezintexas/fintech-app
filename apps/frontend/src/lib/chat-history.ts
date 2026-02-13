/**
 * Chat history persistence per user and persona.
 * Stored in MongoDB chatHistory collection, keyed by userId + persona.
 */

import { getDb } from "./mongodb";

const COLLECTION = "chatHistory";
const MAX_MESSAGES = 50;

export const DEFAULT_PERSONA = "finance-expert";

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export type ChatHistoryDoc = {
  userId: string;
  persona: string;
  messages: ChatHistoryMessage[];
  updatedAt: string;
};

/** Get chat history for user and persona. Backwards-compat: legacy docs (no persona) are treated as DEFAULT_PERSONA. */
export async function getChatHistory(
  userId: string,
  persona: string = DEFAULT_PERSONA
): Promise<ChatHistoryMessage[]> {
  const db = await getDb();
  const doc = await db.collection<ChatHistoryDoc>(COLLECTION).findOne({
    userId,
    persona,
  });
  if (doc?.messages?.length) return doc.messages;
  // Legacy: doc keyed only by userId (no persona)
  if (persona === DEFAULT_PERSONA) {
    const legacy = await db
      .collection<ChatHistoryDoc & { persona?: string }>(COLLECTION)
      .findOne({ userId, persona: { $exists: false } });
    return legacy?.messages ?? [];
  }
  return [];
}

/** Append messages to user's chat history for the given persona. Trims to last MAX_MESSAGES. */
export async function appendChatHistory(
  userId: string,
  persona: string,
  newMessages: ChatHistoryMessage[]
): Promise<void> {
  if (newMessages.length === 0) return;

  const db = await getDb();
  const now = new Date().toISOString();
  const effectivePersona = persona || DEFAULT_PERSONA;

  // Prefer doc with (userId, persona); fallback to legacy (userId, no persona) when appending to default
  const doc = await db.collection<ChatHistoryDoc>(COLLECTION).findOne({
    userId,
    persona: effectivePersona,
  });
  if (!doc && effectivePersona === DEFAULT_PERSONA) {
    const legacy = await db
      .collection<ChatHistoryDoc & { persona?: string }>(COLLECTION)
      .findOne({ userId, persona: { $exists: false } });
    if (legacy) {
      const existing = legacy.messages ?? [];
      const combined = [...existing, ...newMessages].slice(-MAX_MESSAGES);
      await db.collection(COLLECTION).updateOne(
        { _id: legacy._id },
        { $set: { userId, persona: effectivePersona, messages: combined, updatedAt: now } }
      );
      return;
    }
  }

  const existing = doc?.messages ?? [];
  const combined = [...existing, ...newMessages].slice(-MAX_MESSAGES);

  await db.collection(COLLECTION).updateOne(
    { userId, persona: effectivePersona },
    {
      $set: {
        userId,
        persona: effectivePersona,
        messages: combined,
        updatedAt: now,
      },
    },
    { upsert: true }
  );
}
