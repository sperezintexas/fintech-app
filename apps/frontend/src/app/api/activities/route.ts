import { NextRequest, NextResponse } from "next/server";
import { deleteActivitiesForAccount, getActivitiesForAccount } from "@/lib/activities";
import { requireSessionFromRequest } from "@/lib/require-session";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
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

export async function DELETE(request: NextRequest) {
  const session = await requireSessionFromRequest(request);
  if (session instanceof NextResponse) return session;
  const { searchParams } = new URL(request.url);
  const accountId = searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json(
      { error: "accountId is required" },
      { status: 400 }
    );
  }
  try {
    const deleted = await deleteActivitiesForAccount(accountId);
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("[activities] DELETE", error);
    return NextResponse.json(
      { error: "Failed to delete activities" },
      { status: 500 }
    );
  }
}
