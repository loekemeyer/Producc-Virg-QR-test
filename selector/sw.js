/* =========================================================
   sw.js — Service Worker del SELECTOR de planta.
   Mismo patrón "no-cache" que las apps Virgilio/Cervantes:
   NO cachea estáticos (para no dejar pantallas pegadas a una
   versión vieja) y limpia cualquier caché previa al activar.
   Scope acotado a /selector/ por estar registrado con ruta relativa.
   ========================================================= */
const SW_VERSION = "selector-v1.0";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    } catch (e) { /* ignore */ }
    await self.clients.claim();
  })());
});

// No intercepta: deja que todo vaya directo a la red.
self.addEventListener("fetch", () => {});
