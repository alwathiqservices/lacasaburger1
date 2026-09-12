/**
 * sw.js — LaCasa Burger
 * Network First:
 * يحاول دائماً جلب أحدث نسخة من الإنترنت،
 * وإذا ماكو إنترنت يستخدم النسخة المخزنة.
 */

const CACHE_NAME = "lacasa-shell-v3";

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./script.js",
  "./config.js",
  "./menu.json",
  "./assets/images/logo.png",
];


// تثبيت Service Worker
self.addEventListener("install", (event) => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch((error) => {
        console.log("Cache install error:", error);
      })
  );
});


// حذف جميع نسخ الكاش القديمة
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});


// جلب أحدث نسخة أولاً
self.addEventListener("fetch", (event) => {

  if (event.request.method !== "GET") return;

  event.respondWith(

    fetch(event.request)

      .then((response) => {

        // نخزن النسخة الجديدة
        if (response && response.status === 200) {

          const responseClone = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });

        }

        // نعرض النسخة الجديدة
        return response;

      })

      .catch(() => {

        // إذا ماكو إنترنت استخدم الكاش
        return caches.match(event.request);

      })

  );

});
