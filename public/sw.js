// Service Worker for Push Notifications
self.addEventListener("push", function (event) {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "myInvestments Alert";
  const options = {
    body: data.body || "You have a new alert",
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: data.tag || "alert",
    data: data.data || {},
    requireInteraction: data.requireInteraction || false,
    actions: data.actions || [],
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Handle notification clicks
self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const urlToOpen = event.notification.data.url || "/watchlist";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Check if there's already a window/tab open with the target URL
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url === urlToOpen && "focus" in client) {
          return client.focus();
        }
      }
      // If not, open a new window/tab
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});
