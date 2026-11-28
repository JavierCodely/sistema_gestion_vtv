/**
 * PWA (instalable en Android): registra `public/sw.js` solo en producción. En desarrollo no, para no
 * interferir con Vite. Si el registro falla la app sigue funcionando igual (solo no se puede instalar).
 */
export function registrarServiceWorker(produccion: boolean = import.meta.env.PROD): void {
  if (!produccion || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.error("No se pudo registrar el service worker", error);
    });
  });
}
