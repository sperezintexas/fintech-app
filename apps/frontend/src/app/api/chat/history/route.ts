import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getChatHistory } from "@/lib/chat-history";

export const dynamic = "force-dynamic";

/** GET - Return chat history for current user. */
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? (session?.user as { username?: string })?.username;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const messages = await getChatHistory(userId);
    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to fetch chat history:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat history" },
      { status: 500 }
    );
  }
}
