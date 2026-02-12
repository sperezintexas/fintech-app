"use client";

// Request notification permission and subscribe to push
export async function requestPushPermission(): Promise<{
  success: boolean;
  subscription: PushSubscriptionJSON | null;
  error?: string;
}> {
  if (!("Notification" in window)) {
    return {
      success: false,
      subscription: null,
      error: "This browser does not support notifications",
    };
  }

  if (Notification.permission === "granted") {
    // Already granted, get subscription
    return await subscribeToPush();
  }

  if (Notification.permission === "denied") {
    return {
      success: false,
      subscription: null,
      error: "Notification permission was denied",
    };
  }

  // Request permission
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    return {
      success: false,
      subscription: null,
      error: "Notification permission not granted",
    };
  }

  return await subscribeToPush();
}

// Subscribe to push notifications
async function subscribeToPush(): Promise<{
  success: boolean;
  subscription: PushSubscriptionJSON | null;
  error?: string;
}> {
  try {
    // Register service worker
    if (!("serviceWorker" in navigator)) {
      return {
        success: false,
        subscription: null,
        error: "Service workers not supported",
      };
    }

    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    // Get VAPID public key
    const vapidRes = await fetch("/api/push/send");
    if (!vapidRes.ok) {
      // Fallback to direct notifications if VAPID not configured
      return {
        success: true,
        subscription: null,
        error: "VAPID not configured - using direct notifications",
      };
    }

    const { publicKey } = await vapidRes.json();

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });

    return {
      success: true,
      subscription: subscription.toJSON() as PushSubscriptionJSON,
    };
  } catch (error: unknown) {
    console.error("Failed to subscribe to push:", error);
    const err = error as { message?: string };
    return {
      success: false,
      subscription: null,
      error: err.message || "Failed to subscribe",
    };
  }
}

type PushSubscriptionJSON = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

// Convert VAPID key from URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(new ArrayBuffer(rawData.length));

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Show notification directly (fallback when push not available)
export function showDirectNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>
): void {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    console.warn("Cannot show notification - permission not granted");
    return;
  }

  const notification = new Notification(title, {
    body,
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: (data?.symbol as string) || "alert",
    data,
    requireInteraction: false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
    if (data?.url) {
      window.location.href = data.url as string;
    }
  };
}

// Register push subscription with server
export async function registerPushSubscription(
  subscription: PushSubscriptionJSON,
  accountId: string
): Promise<boolean> {
  try {
    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription,
        accountId,
      }),
    });

    return res.ok;
  } catch (error) {
    console.error("Failed to register subscription:", error);
    return false;
  }
}
