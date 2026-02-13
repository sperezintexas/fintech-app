import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";

export const dynamic = "force-dynamic";

// VAPID keys - should be in environment variables
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@myinvestments.app";

// Configure web-push
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// POST - Send push notification
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { subscription, title, body: notificationBody, data } = body;

    if (!subscription || !title) {
      return NextResponse.json(
        { error: "subscription and title are required" },
        { status: 400 }
      );
    }

    // If VAPID keys are not configured, return error with instructions
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return NextResponse.json(
        {
          error: "VAPID keys not configured",
          message: "Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in environment variables",
          fallback: "Use browser Notification API directly",
        },
        { status: 500 }
      );
    }

    const payload = JSON.stringify({
      title,
      body: notificationBody || "",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      tag: data?.symbol || "alert",
      data: data || {},
      requireInteraction: false,
    });

    try {
      await webpush.sendNotification(subscription, payload);
      return NextResponse.json({
        success: true,
        message: "Push notification sent",
      });
    } catch (error: unknown) {
      // Handle specific web-push errors
      const webPushError = error as { statusCode?: number };
      if (webPushError.statusCode === 410) {
        // Subscription expired
        return NextResponse.json(
          { error: "Subscription expired", expired: true },
          { status: 410 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("Failed to send push notification:", error);
    return NextResponse.json(
      { error: "Failed to send push notification" },
      { status: 500 }
    );
  }
}

// GET - Get VAPID public key (for client-side subscription)
export async function GET() {
  if (!VAPID_PUBLIC_KEY) {
    return NextResponse.json(
      { error: "VAPID keys not configured" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    publicKey: VAPID_PUBLIC_KEY,
  });
}
