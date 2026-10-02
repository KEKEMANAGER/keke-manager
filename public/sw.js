/*
 * KEKE Manager — service worker.
 *
 * Its only job is notifications. It deliberately does not cache anything: the
 * site is served from Cloudflare with a revalidating HTML document and
 * immutable hashed assets, and a caching worker on top of that is the classic
 * way to leave people staring at a week-old build.
 */

self.addEventListener('install', () => {
  // Take over straight away, so a company that has just allowed notifications
  // does not have to close every tab before the first one can arrive.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: 'KEKE Manager', body: event.data ? event.data.text() : '' };
  }

  const title = payload.title || 'KEKE Manager';
  const data = payload.data || {};

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || '',
      icon: '/logo.png',
      badge: '/logo.png',
      // One notification per kind replaces the previous one of that kind
      // instead of piling up — four reminders about the same booking should
      // leave one line in the tray, not four.
      tag: String(data.type || 'keke'),
      renotify: true,
      data,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const path = routeFor(data);
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse a tab that already has the site open rather than opening a
      // seventh one; people leave this site open all day.
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          client.focus();
          if ('navigate' in client) client.navigate(target);
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

function routeFor(data) {
  switch (data.type) {
    case 'price_quote':
      return '/price-request';
    case 'new_booking':
    case 'booking_accepted':
    case 'booking_confirmed':
    case 'booking_started':
    case 'booking_completed':
      return '/dashboard';
    case 'chat':
    case 'message':
      return '/chat-list';
    default:
      return '/dashboard';
  }
}
