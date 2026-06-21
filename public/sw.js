self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  if (!e.data) return;

  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: e.data.text() };
  }

  const { title, body, icon = '/icons/icon.svg', url } = payload;

  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon,
      data: { url },
    }),
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();

  const targetUrl = e.notification.data?.url;
  if (!targetUrl) return;

  e.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(clients => {
        const match = clients.find(c => c.url === targetUrl);
        if (match) return match.focus();
        return self.clients.openWindow(targetUrl);
      }),
  );
});
