/**
 * drafts.rw service worker
 * Handles Web Push notifications and click routing.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data?.json() ?? {}; } catch {}

  const rawUrl = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/";
  const title = data.title ?? "drafts.rw";
  const options = {
    body:  data.body  ?? "you have a new notification",
    icon:  "/favicon-192.png",
    badge: "/favicon-72.png",
    data:  { url: rawUrl },
    // Group notifications by type so they collapse nicely on Android
    tag:   data.tag ?? "drafts-notif",
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawClickUrl = event.notification.data?.url ?? "/";
  const url = typeof rawClickUrl === "string" && rawClickUrl.startsWith("/") ? rawClickUrl : "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if open, otherwise open a new one
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
