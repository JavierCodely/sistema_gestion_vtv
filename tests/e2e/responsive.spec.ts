import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN,
  abrirTurnoComoAdmin,
  cerrarTurnoDesdeBarra,
  ingresar,
  ingresarEfectivo,
  salir,
  sqlLocal,
  trabajarEnCaja,
  unico,
  venderEnCaja,
} from "./utilidades";

// Celular (ancho de un iPhone 12/13/14): el panel del admin se usa entero desde acá.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

/** Cuánto se pasa la página del ancho de la pantalla (0 = sin scroll horizontal). */
async function desborde(page: Page) {
  return page.evaluate<number>(
    "document.documentElement.scrollWidth - document.documentElement.clientWidth",
  );
}

/** Ancho de un elemento y su borde derecho (para ver que entra en la pantalla). */
async function caja(page: Page, testId: string) {
  const rect = await page.getByTestId(testId).boundingBox();
  expect(rect).not.toBeNull();
  return rect ?? { x: 0, y: 0, width: 0, height: 0 };
}

const PANTALLAS = [
  ["Dashboard", "Dashboard"],
  ["Ventas", "Ventas"],
  ["Patentes", "Patentes"],
  ["Facturación", "Facturación"],
  ["Alertas", "Alertas"],
  ["Usuarios", "Usuarios"],
  ["Cajas", "Cajas"],
  ["Servicios", "Servicios y categorías"],
  ["Descuentos", "Descuentos"],
  ["Impuestos", "Impuestos"],
  ["Certificados", "Certificados"],
  ["Gastos", "Gastos"],
  ["Fondos", "Fondos"],
  ["Configuración ARCA", "Configuración ARCA"],
] as const;

test("en el celular el admin abre el menú desde la barra y ninguna pantalla se pasa del ancho", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  // El menú lateral no ocupa la pantalla: se abre con "Abrir el menú".
  await expect(page.getByRole("navigation", { name: "Menú de administración" })).toBeHidden();

  for (const [link, titulo] of PANTALLAS) {
    await page.getByRole("banner").getByRole("button", { name: "Abrir el menú" }).click();
    const menu = page.getByRole("dialog", { name: "Sistema VTV" });
    await menu.getByRole("link", { name: link, exact: true }).click();
    // Elegir una pantalla cierra el menú.
    await expect(menu).toBeHidden();
    await expect(page.getByRole("heading", { level: 1, name: titulo, exact: true })).toBeVisible();
    // Las tablas anchas se desplazan dentro de su recuadro: la página nunca.
    await expect.poll(() => desborde(page), { message: `"${titulo}" se pasa del ancho` }).toBe(0);
  }
  await salir(page);
});

test("en el celular las ventas del turno se ven como tarjetas con todos sus datos", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const sufijo = unico();
  const cajaNombre = `Caja movil ${sufijo}`;
  const categoria = `Cat movil ${sufijo}`;
  const servicio = `Servicio movil ${sufijo}`;
  const patente = `MV${sufijo.slice(-3)}AA`;
  // Catálogo propio de esta corrida (una sentencia por llamada; nombres sin acentos para la consola).
  sqlLocal(`insert into public.cajas (nombre) values ('${cajaNombre}')`);
  sqlLocal(`insert into public.categorias_servicio (nombre) values ('${categoria}')`);
  sqlLocal(
    `insert into public.servicios (nombre, categoria_id, precio, requiere_certificado) ` +
      `select '${servicio}', id, 30000, false from public.categorias_servicio ` +
      `where nombre = '${categoria}'`,
  );

  await ingresar(page, ADMIN);
  await expect(page).toHaveURL("/admin");
  await ingresarEfectivo(page, "10.000", `Cambio móvil ${sufijo}`);
  await abrirTurnoComoAdmin(page, { caja: cajaNombre, efectivo: "5.000" });
  await trabajarEnCaja(page, cajaNombre);
  await expect.poll(() => desborde(page), { message: "la caja se pasa del ancho" }).toBe(0);
  await venderEnCaja(page, { categoria, servicio, medio: "Tarjeta", patente });

  // Ventas del admin: el turno abierto con sus totales y la venta como tarjeta.
  await page.goto("/admin/ventas");
  const turno = page.locator("[data-testid^='turno-abierto-']").filter({ hasText: cajaNombre });
  // Con varias cajas abiertas (de otras pruebas), la pestaña de esta.
  const pestana = page.getByRole("tab", { name: cajaNombre, exact: true });
  await expect(pestana.or(turno)).toBeVisible();
  if (await pestana.isVisible()) await pestana.click();
  await expect(turno.getByTestId("vivo-Total ventas")).toHaveText(/30\.000,00/);
  const fila = turno.locator("[data-testid^='venta-']").first();
  await expect(fila).toContainText(patente);
  await expect(fila).toContainText(servicio);
  await expect(fila).toContainText(/30\.000,00/);
  // Sin encabezado de tabla: cada dato lleva su etiqueta y la tarjeta entra entera en la pantalla.
  await expect(turno.getByRole("columnheader", { name: "Patente" })).toBeHidden();
  await expect(fila.locator("td[data-label='Patente']")).not.toHaveCSS("display", "table-cell");
  const id = (await fila.getAttribute("data-testid")) ?? "";
  const tarjeta = await caja(page, id);
  expect(tarjeta.x).toBeGreaterThanOrEqual(0);
  expect(tarjeta.x + tarjeta.width).toBeLessThanOrEqual(390);
  await expect(fila.getByRole("button", { name: /^Anular venta N°/ })).toBeVisible();
  await expect.poll(() => desborde(page), { message: "Ventas se pasa del ancho" }).toBe(0);

  // Detalle del turno: también sin scroll horizontal.
  await turno.getByRole("link", { name: "Ver detalle del turno" }).click();
  await expect(page.getByRole("heading", { level: 1, name: cajaNombre })).toBeVisible();
  await expect(page.locator("[data-testid^='venta-']").first()).toContainText(patente);
  await expect.poll(() => desborde(page), { message: "el detalle se pasa del ancho" }).toBe(0);

  await cerrarTurnoDesdeBarra(page, { caja: cajaNombre });
  // El historial de turnos también es de tarjetas.
  await page.goto("/admin/ventas");
  const historial = page.locator("[data-testid^='turno-']").filter({ hasText: cajaNombre }).first();
  await expect(historial).toContainText("Cerrado");
  await expect.poll(() => desborde(page), { message: "el historial se pasa del ancho" }).toBe(0);
  await salir(page);
});
