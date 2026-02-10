import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getActivitiesForAccount } from "@/lib/activities";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required" },
      { status: 400 }
    );
  }

  try {
    const activities = await getActivitiesForAccount(accountId);
    return NextResponse.json(activities);
  } catch (error) {
    console.error("[activities] GET", error);
    return NextResponse.json(
      { error: "Failed to fetch activities" },
      { status: 500 }
    );
  }
}
