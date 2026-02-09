import { NextRequest, NextResponse } from "next/server";
import { getProfileConfig, setProfileConfig } from "@/lib/app-util";

export const dynamic = "force-dynamic";

/** GET - Return profile preferences (display timezone) */
export async function GET() {
  try {
    const profile = await getProfileConfig();
    return NextResponse.json(profile);
  } catch (error) {
    console.error("Failed to fetch profile:", error);
    return NextResponse.json(
      { error: "Failed to fetch profile" },
      { status: 500 }
    );
  }
}

/** PUT - Update profile (display timezone) */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const displayTimezone = body?.displayTimezone;
    if (displayTimezone !== undefined) {
      const updated = await setProfileConfig({
        displayTimezone: typeof displayTimezone === "string" ? displayTimezone : undefined,
      });
      return NextResponse.json(updated);
    }
    const profile = await getProfileConfig();
    return NextResponse.json(profile);
  } catch (error) {
    console.error("Failed to update profile:", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}
