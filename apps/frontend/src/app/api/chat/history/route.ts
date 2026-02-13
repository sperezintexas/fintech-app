import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getChatHistory, DEFAULT_PERSONA } from "@/lib/chat-history";

export const dynamic = "force-dynamic";

/** GET - Return chat history for current user and persona (query param ?persona=). */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    const userId = session?.user?.id ?? (session?.user as { username?: string })?.username;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const persona =
      request.nextUrl.searchParams.get("persona")?.trim() || DEFAULT_PERSONA;
    const messages = await getChatHistory(userId, persona);
    return NextResponse.json(messages);
  } catch (error) {
    console.error("Failed to fetch chat history:", error);
    return NextResponse.json(
      { error: "Failed to fetch chat history" },
      { status: 500 }
    );
  }
}
