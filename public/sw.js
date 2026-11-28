/*
 * Service worker de la PWA (instalable en Android).
 *
 * El sistema trabaja siempre contra la base (ventas, caja, dinero): no guarda datos ni pantallas
 * para usarlas sin conexión. Solo:
 * - las pantallas se piden siempre a la red (nunca una versión vieja después de una actualización);
 * - si no hay conexión, en vez del error del navegador muestra `offline.html` ("Sin conexión").
 * Los pedidos a Supabase y los archivos de la app no pasan por acá: van directo a la red.
 */
const CACHE = "vtv-sin-conexion-v1";
const SIN_CONEXION = "/offline.html";
const ARCHIVOS = [SIN_CONEXION, "/iconos/icono-192.png"];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ARCHIVOS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.mode !== "navigate") return;
  evento.respondWith(
    fetch(pedido).catch(() =>
      caches.match(SIN_CONEXION).then((respuesta) => respuesta ?? Response.error()),
    ),
  );
});
