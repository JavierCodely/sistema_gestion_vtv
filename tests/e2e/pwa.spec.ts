import { expect, test } from "@playwright/test";

/** Lo que usa el test del service worker (el tsconfig de las E2E no incluye los tipos del DOM). */
interface ConServiceWorker {
  serviceWorker: {
    register(url: string): Promise<unknown>;
    ready: Promise<unknown>;
    controller: unknown;
  };
}

interface Manifiesto {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: { src: string; sizes: string; purpose: string }[];
}

test("la app se puede instalar: manifiesto e íconos que pide Android", async ({
  page,
  request,
}) => {
  await page.goto("/login");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#16a34a");

  const respuesta = await request.get("/manifest.webmanifest");
  expect(respuesta.ok()).toBe(true);
  const manifiesto = (await respuesta.json()) as Manifiesto;
  expect(manifiesto).toMatchObject({
    name: "Sistema VTV",
    short_name: "VTV",
    start_url: "/",
    display: "standalone",
  });
  for (const [tamano, proposito] of [
    ["192x192", "any"],
    ["512x512", "any"],
    ["512x512", "maskable"],
  ] as const) {
    const icono = manifiesto.icons.find((i) => i.sizes === tamano && i.purpose === proposito);
    expect(icono, `ícono ${tamano} ${proposito}`).toBeDefined();
    // Tamaño real del PNG: ancho y alto están en la cabecera IHDR (bytes 16 a 23).
    const png = await (await request.get(icono?.src ?? "")).body();
    const ancho = `${String(png.readUInt32BE(16))}x${String(png.readUInt32BE(20))}`;
    expect(ancho).toBe(tamano);
  }
});

test("sin conexión muestra el aviso en vez del error del navegador", async ({ page, context }) => {
  await page.goto("/login");
  // En desarrollo la app no lo registra (solo en producción): se registra a mano el mismo archivo.
  await page.evaluate(async () => {
    const { serviceWorker } = navigator as unknown as ConServiceWorker;
    await serviceWorker.register("/sw.js");
    await serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () => (navigator as unknown as ConServiceWorker).serviceWorker.controller !== null,
      ),
    )
    .toBe(true);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sin conexión" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reintentar" })).toBeVisible();

  await context.setOffline(false);
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("heading", { name: "Sin conexión" })).toBeHidden();
});
