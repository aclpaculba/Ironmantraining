"use strict";
/* Raceplan service worker: shows push notifications and opens the app (on today's workout) when one is tapped. No caching. */
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  // iOS requires every push to show a notification.
  e.waitUntil(self.registration.showNotification(d.title || "Raceplan", {
    body: d.body || "",
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    tag: d.tag || "raceplan",
    data: { url: d.url || "./" }
  }));
});

self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "./";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    // App already open: tell it where to go and bring it to the front.
    for (var i = 0; i < list.length; i++) {
      if ("focus" in list[i]) { list[i].postMessage({ type: "open", url: url }); return list[i].focus(); }
    }
    // App closed: start it at that address (the app reads ?open=DATE).
    return self.clients.openWindow(url);
  }));
});
