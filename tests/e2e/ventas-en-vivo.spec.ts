import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  abrirTurnoComoAdmin,
  ADMIN,
  CAJERO,
  cerrarTurnoDesdeBarra,
  ingresar,
  ingresarEfectivo,
  trabajarEnCaja,
  unico,
  venderEnCaja,
} from "./utilidades";

async function elegir(page: Page, contenedor: Locator, etiqueta: string, opcion: string) {
  await contenedor.getByLabel(etiqueta).click();
  await page.getByRole("option", { name: opcion, exact: true }).click();
}

/**
 * Sección "Turnos abiertos" de /admin/ventas en el turno de `caja`: con varias cajas abiertas (de
 * otras pruebas) elige su pestaña.
 */
async function turnoAbiertoDe(page: Page, caja: string) {
  const pestanas = page.getByRole("tablist", { name: "Turnos abiertos" });
  const seccion = page.locator('[data-testid^="turno-abierto-"]').filter({ hasText: caja });
  await expect(pestanas.or(seccion).first()).toBeVisible();
  if (await pestanas.isVisible()) {
    await pestanas.getByRole("tab", { name: caja, exact: true }).click();
  }
  await expect(seccion).toBeVisible();
  return seccion;
}

test("ventas en vivo: el admin ve aparecer la venta del cajero y los totales al día sin recargar; el historial filtra por fecha de apertura", async ({
  page,
  browser,
}) => {
  test.setTimeout(150_000);
  const sufijo = unico();
  const caja = `Caja vivo ${sufijo}`;
  const categoria = `Cat vivo ${sufijo}`;
  const servicio = `Servicio vivo ${sufijo}`;

  // --- Admin: caja, servicio de $ 15.000, efectivo para el cambio y turno abierto
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await page.goto("/admin/cajas");
  await page.getByRole("button", { name: "Nueva caja" }).click();
  const nuevaCaja = page.getByRole("dialog", { name: "Nueva caja" });
  await nuevaCaja.getByLabel("Nombre").fill(caja);
  await nuevaCaja.getByRole("button", { name: "Crear caja" }).click();
  await expect(page.getByText(`Caja “${caja}” creada`)).toBeVisible();
  await page.goto("/admin/servicios");
  await page.getByRole("button", { name: "Nueva categoría" }).click();
  const nuevaCategoria = page.getByRole("dialog", { name: "Nueva categoría" });
  await nuevaCategoria.getByLabel("Nombre").fill(categoria);
  await nuevaCategoria.getByRole("button", { name: "Crear categoría" }).click();
  await expect(page.getByText(`Categoría “${categoria}” creada`)).toBeVisible();
  await page.getByRole("button", { name: "Nuevo servicio" }).click();
  const nuevoServicio = page.getByRole("dialog", { name: "Nuevo servicio" });
  await nuevoServicio.getByLabel("Nombre").fill(servicio);
  await elegir(page, nuevoServicio, "Categoría", categoria);
  await nuevoServicio.getByLabel("Precio ($)").fill("15.000");
  await nuevoServicio.getByRole("button", { name: "Crear servicio" }).click();
  await expect(page.getByText(`Servicio “${servicio}” creado`)).toBeVisible();
  await ingresarEfectivo(page, "3.000", `Cambio ${sufijo}`);
  await abrirTurnoComoAdmin(page, { caja, efectivo: "3.000" });

  // --- Admin en /admin/ventas: el turno abierto con totales en 0 y la conexión en vivo
  await page.goto("/admin/ventas");
  await expect(page.getByTestId("estado-en-vivo")).toHaveText("En vivo");
  const turno = await turnoAbiertoDe(page, caja);
  await expect(turno.getByTestId("vivo-Total ventas")).toHaveText(/\$\s0,00/);
  // El efectivo del cajón, dentro de los totales: el efectivo inicial
  await expect(turno.getByTestId("vivo-efectivo-en-caja")).toHaveText(/\$\s3\.000,00/);
  await expect(turno.getByText("Todavía no hay ventas en este turno.")).toBeVisible();

  // --- Cajero (otro navegador) vende en esa caja
  const contextoCajero = await browser.newContext();
  const pc = await contextoCajero.newPage();
  await ingresar(pc, CAJERO);
  await expect(pc).toHaveURL("/caja");
  await trabajarEnCaja(pc, caja);
  await venderEnCaja(pc, { categoria, servicio, medio: "Transferencia", patente: "VI123VO" });

  // --- Admin, SIN recargar: aparece la venta y los totales se actualizan solos (Realtime)
  await expect(turno.getByRole("cell", { name: "VI123VO" })).toBeVisible({ timeout: 15_000 });
  await expect(turno.getByTestId("vivo-Transferencia")).toHaveText(/15\.000,00/);
  await expect(turno.getByTestId("vivo-Total ventas")).toHaveText(/15\.000,00/);
  // Por transferencia: el efectivo del cajón no cambia
  await expect(turno.getByTestId("vivo-efectivo-en-caja")).toHaveText(/\$\s3\.000,00/);
  await expect(turno.getByText(/Atendieron: .*Carlos/)).toBeVisible();

  // --- Historial: el turno figura en el período de hoy (fecha de apertura) y no en otro
  const historial = page.getByRole("region", { name: "Historial de turnos" });
  await expect(historial.getByRole("row").filter({ hasText: caja })).toBeVisible();
  await historial.getByLabel("Desde").fill("2001-01-01");
  await historial.getByLabel("Hasta").fill("2001-01-31");
  await expect(historial.getByText("No se abrió ningún turno en esas fechas.")).toBeVisible();
  await expect(historial.getByTestId("rango-Total ventas")).toHaveText(/\$\s0,00/);

  await contextoCajero.close();
  await cerrarTurnoDesdeBarra(page, { caja });
  // Cerrado: deja la sección de abiertos sin volver a cargar la página
  await expect(
    page.locator('[data-testid^="turno-abierto-"]').filter({ hasText: caja }),
  ).toHaveCount(0);
});
