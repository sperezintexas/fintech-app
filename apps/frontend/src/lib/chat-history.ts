/**
 * Chat history persistence per user.
 * Stored in MongoDB chatHistory collection.
 */

import { getDb } from "./mongodb";

const COLLECTION = "chatHistory";
const MAX_MESSAGES = 50;

export type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export type ChatHistoryDoc = {
  userId: string;
  messages: ChatHistoryMessage[];
  updatedAt: string;
};

/** Get chat history for user. */
export async function getChatHistory(userId: string): Promise<ChatHistoryMessage[]> {
  const db = await getDb();
  const doc = await db.collection<ChatHistoryDoc>(COLLECTION).findOne({ userId });
  return doc?.messages ?? [];
}

/** Append messages to user's chat history. Trims to last MAX_MESSAGES. */
export async function appendChatHistory(
  userId: string,
  newMessages: ChatHistoryMessage[]
): Promise<void> {
  if (newMessages.length === 0) return;

  const db = await getDb();
  const now = new Date().toISOString();

  const doc = await db.collection<ChatHistoryDoc>(COLLECTION).findOne({ userId });
  const existing = doc?.messages ?? [];
  const combined = [...existing, ...newMessages].slice(-MAX_MESSAGES);

  await db.collection(COLLECTION).updateOne(
    { userId },
    {
      $set: {
        userId,
        messages: combined,
        updatedAt: now,
      },
    },
    { upsert: true }
  );
}
