/* 黎念 · 本地通知用的 Service Worker
 *
 * 它不连接推送服务器，只负责：
 *   · 页面还活着、切到后台时，把页面发来的通知显示出来；
 *   · 点通知时回到已经打开的 App，或者重新打开。
 *
 * 页面被系统彻底杀掉后，这里不会收到任何消息 —— 网页做不到真正的后台推送。
 */
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification?.data?.url || self.registration.scope
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of all) {
        if ('focus' in client) {
          await client.focus()
          return
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target)
    })(),
  )
})
