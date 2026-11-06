// build: v1.0.13
/**
 * sw.js - Service Worker 離線快取管理
 * 版本號由 js/version.js 單一來源控制，此檔案無須手動更改版本
 */

importScripts('./js/version.js');

const CACHE_NAME = 'my-bp-cache-' + (self.APP_VERSION || 'v1.0.0');

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/version.js',
  './js/db.js',
  './js/csv.js',
  './js/chart.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 安裝 Service Worker 並預先載入核心資源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 啟動階段：清除舊快取版本
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 支援前端主動發送 SKIP_WAITING 訊息立即接管
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 攔截網路請求：Cache First，若快取有就先用快取，同時背景更新
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // 帶有查詢參數 (例如 ?t= 時戳) 的動態或檢查請求，不進行快取攔截，直連網路
  const url = new URL(event.request.url);
  if (url.search) return;

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // 背景嘗試抓最新版本更新快取
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
          }
        }).catch(() => {});

        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      });
    })
  );
});
